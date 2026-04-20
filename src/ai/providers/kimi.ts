import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import {
    buildProviderError,
    extractChatCompletionContent,
    extractModelIds,
    modelIdsMatch,
    requestWithRetry,
} from './providerUtils';

/**
 * Kimi (Moonshot) provider — uses OpenAI-compatible API format.
 */
export class KimiProvider extends AIProvider {
    private readonly endpoint: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.endpoint = config.baseUrl || 'https://api.moonshot.cn/v1/chat/completions';
        Logger.info('KimiProvider initialized', { model: config.model, endpoint: this.endpoint });
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info('KimiProvider: Analyzing changes', { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        const response = await this.makeRequest(prompt);

        let content = '';
        try {
            content = extractChatCompletionContent(response, 'Kimi');
        } catch (error) {
            Logger.warn('KimiProvider: Response content extraction failed, falling back to parser heuristics', {
                message: error instanceof Error ? error.message : String(error),
            });
        }
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('KimiProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        let repairContent = '';
        try {
            repairContent = extractChatCompletionContent(repairResponse, 'Kimi');
        } catch (error) {
            Logger.warn('KimiProvider: Repair response content extraction failed', {
                message: error instanceof Error ? error.message : String(error),
            });
            throw buildProviderError('Kimi API Error', error);
        }
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        Logger.info('KimiProvider: Generating commit message', { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        try {
            return ResponseParser.parseMessageResponse(
                extractChatCompletionContent(response, 'Kimi')
            );
        } catch (error) {
            Logger.error('KimiProvider: Response content extraction failed', error);
            throw buildProviderError('Kimi API Error', error);
        }
    }

    async validateApiKey(): Promise<boolean> {
        try {
            Logger.info('KimiProvider: Validating API key');
            const baseUrl = this.config.baseUrl || 'https://api.moonshot.cn/v1';
            await requestWithRetry(
                'KimiProvider.validateApiKey',
                () => axios.get(`${baseUrl}/models`, {
                    headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
                    timeout: 5000
                }),
                2
            );
            return true;
        } catch (error) {
            Logger.error('KimiProvider: API key validation failed', error);
            return false;
        }
    }

    async validateModelAvailability(): Promise<{ available: boolean; reason?: string; models?: string[] }> {
        const selectedModel = (this.config.model || 'moonshot-v1-8k').trim();
        const baseUrl = this.config.baseUrl || 'https://api.moonshot.cn/v1';
        try {
            const response = await axios.get(`${baseUrl}/models`, {
                headers: { Authorization: `Bearer ${this.config.apiKey}` },
                timeout: 5000,
            });
            const models = extractModelIds(response.data);
            if (models.length > 0 && !models.some(model => modelIdsMatch(selectedModel, model))) {
                return {
                    available: false,
                    reason: `Model "${selectedModel}" is not available for this Moonshot key.`,
                    models,
                };
            }
            return { available: true, models };
        } catch (error) {
            return {
                available: false,
                reason: error instanceof Error ? error.message : 'Unable to verify model availability.',
            };
        }
    }

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const model = this.config.model || 'moonshot-v1-8k';

            Logger.debug('KimiProvider: Making API request', { model, promptLength: prompt.length });

            const response = await requestWithRetry(
                'KimiProvider.makeRequest',
                () => axios.post(
                    this.endpoint,
                    {
                        model,
                        messages: [
                            {
                                role: 'system',
                                content: 'You are an expert at analyzing code changes and organizing them into logical commits. Respond with valid JSON only.'
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: this.config.temperature || 0.2,
                        max_tokens: this.config.maxTokens || 3000,
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.config.apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 45000
                    }
                ),
                3
            );

            Logger.debug('KimiProvider: API response received', { status: response.status });
            return response.data;
        } catch (error) {
            Logger.error('KimiProvider: API request failed', error);
            throw buildProviderError('Kimi API Error', error);
        }
    }
}
