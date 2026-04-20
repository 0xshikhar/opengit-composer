import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import {
    buildProviderError,
    extractModelIds,
    modelIdsMatch,
    requestWithRetry,
} from './providerUtils';

/**
 * LM Studio provider — OpenAI-compatible local model inference.
 */
export class LMStudioProvider extends AIProvider {
    private readonly baseUrl: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.baseUrl = this.normalizeBaseUrl(config.baseUrl || 'http://localhost:1234/v1');
        // Warn if baseUrl looks like Ollama instead of LM Studio
        if (this.baseUrl.includes('11434') || this.baseUrl.includes('/api/chat')) {
            Logger.warn('LMStudioProvider initialized with Ollama-style baseUrl', { baseUrl: this.baseUrl });
        }
        Logger.info('LMStudioProvider initialized', { model: config.model, baseUrl: this.baseUrl });
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info('LMStudioProvider: Analyzing changes', { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        Logger.aiRequest('LM Studio', this.config.model || 'active-local-model', prompt.length);
        const response = await this.makeRequest(prompt, 'json');
        const content = response.choices?.[0]?.message?.content || '';

        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('LMStudioProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt, 'json');
        const repairContent = repairResponse.choices?.[0]?.message?.content || '';
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        Logger.info('LMStudioProvider: Generating commit message', { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);
        Logger.aiRequest('LM Studio', this.config.model || 'active-local-model', prompt.length);
        const response = await this.makeRequest(prompt, 'text');
        const content = response.choices?.[0]?.message?.content || '';
        return ResponseParser.parseMessageResponse(content);
    }

    async validateApiKey(): Promise<boolean> {
        try {
            Logger.info('LMStudioProvider: Validating local server availability');
            await requestWithRetry(
                'LMStudioProvider.validateApiKey',
                () => axios.get(`${this.baseUrl}/models`, { timeout: 5000 }),
                2
            );
            return true;
        } catch (error) {
            Logger.error('LMStudioProvider: Server not reachable', error);
            return false;
        }
    }

    async validateModelAvailability(): Promise<{ available: boolean; reason?: string; models?: string[] }> {
        const selectedModel = (this.config.model || '').trim();
        const models = await this.getAvailableModels();

        if (!selectedModel) {
            if (models.length === 0) {
                return {
                    available: false,
                    reason: 'LM Studio server is reachable, but no models are loaded. Start a model in LM Studio or select one in the composer.',
                    models,
                };
            }

            return {
                available: true,
                models,
            };
        }

        if (models.length === 0) {
            return {
                available: false,
                reason: 'LM Studio server is reachable, but no models are loaded. Start a model in LM Studio or clear the explicit model selection.',
                models,
            };
        }

        if (!models.some(model => modelIdsMatch(selectedModel, model))) {
            return {
                available: false,
                reason: `Model "${selectedModel}" is not available on the configured LM Studio server.`,
                models,
            };
        }

        return { available: true, models };
    }

    async getAvailableModels(): Promise<string[]> {
        try {
            Logger.info('LMStudioProvider: Fetching available models');
            const response = await axios.get(`${this.baseUrl}/models`, { timeout: 10000 });
            return extractModelIds(response.data);
        } catch (error) {
            Logger.error('LMStudioProvider: Failed to fetch models', error);
            return [];
        }
    }

    protected async makeRequest(prompt: string, mode: 'json' | 'text' = 'json'): Promise<any> {
        const model = await this.resolveModel();
        const url = `${this.baseUrl}/chat/completions`;

        const executeRequest = async (useResponseFormat: boolean): Promise<any> => {
            const requestBody: Record<string, unknown> = {
                model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert at analyzing code changes and organizing them into logical commits.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: this.config.temperature ?? 0.2,
                max_tokens: this.config.maxTokens ?? 4000,
            };

            if (mode === 'json' && useResponseFormat) {
                Logger.info('LMStudioProvider: Trying response_format for compatibility', {
                    model,
                    baseUrl: this.baseUrl,
                });
                requestBody.response_format = { type: 'json_object' };
            }
            const response = await requestWithRetry(
                'LMStudioProvider.makeRequest',
                () => axios.post(
                    url,
                    requestBody,
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 120000,
                    }
                ),
                2
            );

            Logger.info('LMStudioProvider: API response received', { model, status: response.status });
            return response.data;
        };

        try {
            Logger.info('LMStudioProvider: Making API request', {
                model,
                mode,
                promptLength: prompt.length,
                baseUrl: this.baseUrl,
            });
            const start = Date.now();
            const data = await executeRequest(true);
            Logger.aiResponse('LM Studio', 200, JSON.stringify(data).length, Date.now() - start);
            this.requestMeta = {
                requestedModel: model,
                usedModel: model,
                failover: false,
            };
            return data;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const responseData = axios.isAxiosError(error) ? error.response?.data : undefined;
            const responseText = axios.isAxiosError(error)
                ? `${typeof responseData === 'string' ? responseData : JSON.stringify(responseData || {})} ${message}`
                : message;
            const isResponseFormatError =
                mode === 'json' &&
                /response_format|json_object|JSON|schema|invalid/i.test(responseText);

            if (isResponseFormatError) {
                Logger.warn('LMStudioProvider: Retrying without response_format after request failure', {
                    model,
                    message,
                });
                try {
                    const start = Date.now();
                    const data = await executeRequest(false);
                    Logger.aiResponse('LM Studio', 200, JSON.stringify(data).length, Date.now() - start);
                    this.requestMeta = {
                        requestedModel: model,
                        usedModel: model,
                        failover: true,
                        failoverReason: 'LM Studio request retried without response_format for compatibility.',
                    };
                    return data;
                } catch (fallbackError) {
                    Logger.error('LMStudioProvider: Fallback request without response_format failed', fallbackError);
                    throw buildProviderError('LM Studio API Error', fallbackError);
                }
            }

            Logger.error('LMStudioProvider: API request failed', error);
            throw buildProviderError('LM Studio API Error', error);
        }
    }

    private async resolveModel(): Promise<string> {
        const explicit = (this.config.model || '').trim();
        if (explicit) {
            return explicit;
        }

        const models = await this.getAvailableModels();
        const active = models[0]?.trim();
        if (active) {
            Logger.info('LMStudioProvider: Using active local model', { model: active });
            return active;
        }

        throw new Error('No LM Studio model is currently loaded. Start a model in LM Studio or select one in the composer.');
    }

    private normalizeBaseUrl(baseUrl: string): string {
        const trimmed = baseUrl.replace(/\/$/, '');
        if (/\/v1$/.test(trimmed)) {
            return trimmed;
        }
        return `${trimmed}/v1`;
    }
}
