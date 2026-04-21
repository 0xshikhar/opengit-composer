import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse, GenerateMessageOptions } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import {
    buildProviderError,
    extractModelIds,
    modelIdsMatch,
    normalizeModelId,
    requestWithRetry,
} from './providerUtils';
import { getProviderDefaultModel, getProviderModelOptions } from '../../utils/constant';

export class GeminiProvider extends AIProvider {
    private readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';

    constructor(config: AIProviderConfig) {
        super(config);
        Logger.info('GeminiProvider initialized', { model: config.model });
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info('GeminiProvider: Analyzing changes', { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        const response = await this.makeRequest(prompt, 'json');
        const content = this.extractTextContent(response);

        let parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('GeminiProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt, 'json');
        const repairedContent = this.extractTextContent(repairResponse);
        const repaired = ResponseParser.parseGroupingResponse(repairedContent, changes);

        if (!repaired.parserMeta?.usedFallback) {
            return repaired;
        }

        parsed.reasoning = [
            parsed.reasoning,
            'AI repair pass could not produce strict structured JSON; kept fallback grouping.',
        ].filter(Boolean).join(' ');
        return parsed;
    }

    async generateCommitMessage(files: FileChange[], options?: GenerateMessageOptions): Promise<string> {
        Logger.info('GeminiProvider: Generating commit message', { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt, 'text');
        const content = this.extractTextContent(response);
        return ResponseParser.parseMessageResponse(content);
    }

    async validateApiKey(): Promise<boolean> {
        try {
            Logger.info('GeminiProvider: Validating API key');
            await requestWithRetry(
                'GeminiProvider.validateApiKey',
                () => axios.get(`${this.endpoint}?key=${this.config.apiKey}`, { timeout: 5000 }),
                2
            );
            return true;
        } catch (error) {
            Logger.error('GeminiProvider: API key validation failed', error);
            return false;
        }
    }

    async validateModelAvailability(): Promise<{ available: boolean; reason?: string; models?: string[] }> {
        const selectedModel = normalizeModelId(this.config.model || getProviderDefaultModel('gemini'));
        const fallbackModels = [...getProviderModelOptions('gemini')];
        try {
            const response = await axios.get(`${this.endpoint}?key=${this.config.apiKey}`, { timeout: 5000 });
            const models = extractModelIds(response.data);
            const availableModels = models.length > 0 ? models : fallbackModels;
            const matchesSelectedModel = availableModels.some((model: string) => modelIdsMatch(selectedModel, model));
            if (!matchesSelectedModel) {
                return {
                    available: false,
                    reason: `Model "${selectedModel}" is not listed for this Gemini key.`,
                    models: availableModels,
                };
            }
            return { available: true, models: availableModels };
        } catch (error) {
            return {
                available: false,
                reason: error instanceof Error ? error.message : 'Unable to verify model availability.',
                models: fallbackModels,
            };
        }
    }

    protected async makeRequest(prompt: string, mode: 'json' | 'text' = 'json'): Promise<any> {
        const primaryModel = this.config.model || getProviderDefaultModel('gemini');
        const modelCandidates = this.buildModelCandidates(primaryModel);
        let lastError: unknown;

        Logger.debug('GeminiProvider: Request model candidates', {
            primaryModel,
            mode,
            promptLength: prompt.length,
            candidates: modelCandidates,
        });

        for (let index = 0; index < modelCandidates.length; index++) {
            const candidate = modelCandidates[index];
            try {
                return await this.requestWithModel(candidate, prompt, mode);
            } catch (error) {
                lastError = error;
                if (this.shouldFailoverToNextModel(error) && index < modelCandidates.length - 1) {
                    const message = error instanceof Error ? error.message : String(error);
                    Logger.warn('GeminiProvider: Model request failed; trying next fallback model', {
                        failedModel: candidate,
                        nextModel: modelCandidates[index + 1],
                        status: axios.isAxiosError(error) ? error.response?.status : undefined,
                        code: axios.isAxiosError(error) ? error.code : undefined,
                        message,
                    });
                    continue;
                }

                Logger.error('GeminiProvider: API request failed', error);
                throw buildProviderError('Gemini API Error', error);
            }
        }

        Logger.error('GeminiProvider: All candidate models failed', lastError);
        throw buildProviderError('Gemini API Error', lastError);
    }

    private async requestWithModel(model: string, prompt: string, mode: 'json' | 'text'): Promise<any> {
        const url = `${this.endpoint}/${model}:generateContent?key=${this.config.apiKey}`;

        const executeRequest = async (useSchema: boolean): Promise<any> => {
            const response = await requestWithRetry(
                'GeminiProvider.makeRequest',
                () => axios.post(
                    url,
                    {
                        contents: [
                            {
                                parts: [
                                    {
                                        text: `You are an expert at analyzing code changes and organizing them into logical commits.\n\n${prompt}`
                                    }
                                ]
                            }
                        ],
                        generationConfig: {
                            temperature: this.config.temperature || 0.2,
                            maxOutputTokens: this.config.maxTokens || 4096,
                            responseMimeType: mode === 'json' ? 'application/json' : 'text/plain',
                            ...(mode === 'json' && useSchema ? { responseSchema: this.getGroupingResponseSchema() } : {}),
                        }
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 45000
                    }
                ),
                3
            );

            Logger.debug('GeminiProvider: API response received', { model, status: response.status });
            return response.data;
        };

        try {
            Logger.debug('GeminiProvider: Making API request', {
                model,
                mode,
                promptLength: prompt.length,
            });
            const data = await executeRequest(true);
            this.requestMeta = {
                requestedModel: normalizeModelId(this.config.model || getProviderDefaultModel('gemini')),
                usedModel: normalizeModelId(model),
                failover: normalizeModelId(model) !== normalizeModelId(this.config.model || getProviderDefaultModel('gemini')),
                failoverReason: normalizeModelId(model) !== normalizeModelId(this.config.model || getProviderDefaultModel('gemini'))
                    ? `Gemini switched from ${normalizeModelId(this.config.model || getProviderDefaultModel('gemini'))} to ${normalizeModelId(model)} after overload or availability errors.`
                    : undefined,
            };
            return data;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const responseData = axios.isAxiosError(error) ? error.response?.data : undefined;
            const responseText = axios.isAxiosError(error)
                ? `${typeof responseData === 'string' ? responseData : JSON.stringify(responseData || {})} ${message}`
                : message;
            const isSchemaOrFormatError =
                mode === 'json' &&
                /responseSchema|responseMimeType|schema|JSON|invalid/i.test(responseText);

            if (isSchemaOrFormatError) {
                Logger.warn('GeminiProvider: Retrying without response schema after request failure', {
                    model,
                    message,
                });
                try {
                    const data = await executeRequest(false);
                    this.requestMeta = {
                        requestedModel: normalizeModelId(this.config.model || getProviderDefaultModel('gemini')),
                        usedModel: normalizeModelId(model),
                        failover: normalizeModelId(model) !== normalizeModelId(this.config.model || getProviderDefaultModel('gemini')),
                        failoverReason: normalizeModelId(model) !== normalizeModelId(this.config.model || getProviderDefaultModel('gemini'))
                            ? `Gemini switched from ${normalizeModelId(this.config.model || getProviderDefaultModel('gemini'))} to ${normalizeModelId(model)} after overload or request-shape errors.`
                            : undefined,
                    };
                    return data;
                } catch (retryError) {
                    throw retryError;
                }
            }

            throw error;
        }
    }

    private buildModelCandidates(primaryModel: string): string[] {
        const normalizedPrimary = normalizeModelId(primaryModel);
        return normalizedPrimary ? [normalizedPrimary] : [];
    }

    private shouldFailoverToNextModel(error: unknown): boolean {
        if (!axios.isAxiosError(error)) {
            return false;
        }

        const status = error.response?.status;
        const message = `${error.message || ''} ${typeof error.response?.data === 'string' ? error.response.data : JSON.stringify(error.response?.data || {})}`;
        return status === 503 || status === 429 || /high demand|temporarily unavailable|quota/i.test(message);
    }

    private extractTextContent(response: any): string {
        const candidates = response?.candidates;
        if (!Array.isArray(candidates) || candidates.length === 0) {
            const blockReason = response?.promptFeedback?.blockReason;
            if (blockReason) {
                throw new Error(`Gemini response blocked: ${blockReason}`);
            }
            throw new Error('Gemini response did not include any candidates');
        }

        const candidate = candidates[0];
        const parts = candidate?.content?.parts;
        const text = Array.isArray(parts)
            ? parts
                .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
                .join('\n')
                .trim()
            : '';

        if (text) {
            return text;
        }

        if (candidate?.finishReason) {
            throw new Error(`Gemini response had no text content (finish reason: ${candidate.finishReason})`);
        }

        throw new Error('Gemini response had no text content');
    }

    private getGroupingResponseSchema(): Record<string, unknown> {
        return {
            type: 'object',
            required: ['groups'],
            properties: {
                summary: { type: 'string' },
                reasoning: { type: 'string' },
                groups: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['files', 'type', 'subject', 'confidence'],
                        properties: {
                            files: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                            type: { type: 'string' },
                            scope: { type: 'string' },
                            subject: { type: 'string' },
                            body: { type: 'string' },
                            confidence: { type: 'number' },
                            rationale: { type: 'string' },
                            impact: { type: 'string' },
                            verification: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                            risks: {
                                type: 'array',
                                items: { type: 'string' },
                            },
                        },
                    },
                },
            },
        };
    }
}
