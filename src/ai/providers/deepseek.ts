import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse, GenerateMessageOptions } from '../aiProvider';
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
 * DeepSeek provider — uses OpenAI-compatible API format (https://api.deepseek.com/chat/completions).
 */
export class DeepSeekProvider extends AIProvider {
    private readonly endpoint: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.endpoint = config.baseUrl || 'https://api.deepseek.com/chat/completions';
        Logger.info('DeepSeekProvider initialized', { model: config.model, endpoint: this.endpoint });
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info('DeepSeekProvider: Analyzing changes', { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        const response = await this.makeRequest(prompt);

        let content = '';
        try {
            content = extractChatCompletionContent(response, 'DeepSeek');
        } catch (error) {
            Logger.warn('DeepSeekProvider: Response content extraction failed, falling back to parser heuristics', {
                message: error instanceof Error ? error.message : String(error),
            });
        }
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('DeepSeekProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        let repairContent = '';
        try {
            repairContent = extractChatCompletionContent(repairResponse, 'DeepSeek');
        } catch (error) {
            Logger.warn('DeepSeekProvider: Repair response content extraction failed', {
                message: error instanceof Error ? error.message : String(error),
            });
            throw buildProviderError('DeepSeek API Error', error);
        }
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[], options?: GenerateMessageOptions): Promise<string> {
        Logger.info('DeepSeekProvider: Generating commit message', { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        let content: string;
        try {
            content = extractChatCompletionContent(response, 'DeepSeek');
        } catch (error) {
            Logger.error('DeepSeekProvider: Response content extraction failed', error);
            throw buildProviderError('DeepSeek API Error', error);
        }

        return ResponseParser.parseMessageResponse(content);
    }

    async validateApiKey(): Promise<boolean> {
        try {
            Logger.info('DeepSeekProvider: Validating API key');
            const baseUrl = this.config.baseUrl || 'https://api.deepseek.com';
            await requestWithRetry(
                'DeepSeekProvider.validateApiKey',
                () => axios.get(`${baseUrl}/models`, {
                    headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
                    timeout: 5000
                }),
                2
            );
            return true;
        } catch (error) {
            Logger.error('DeepSeekProvider: API key validation failed', error);
            return false;
        }
    }

    async validateModelAvailability(): Promise<{ available: boolean; reason?: string; models?: string[] }> {
        const selectedModel = (this.config.model || 'deepseek-chat').trim();
        const baseUrl = this.config.baseUrl || 'https://api.deepseek.com';
        try {
            const response = await axios.get(`${baseUrl}/models`, {
                headers: { Authorization: `Bearer ${this.config.apiKey}` },
                timeout: 5000,
            });
            const models = extractModelIds(response.data);
            if (models.length > 0 && !models.some(model => modelIdsMatch(selectedModel, model))) {
                return {
                    available: false,
                    reason: `Model "${selectedModel}" is not available for this DeepSeek key.`,
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
            const model = this.config.model || 'deepseek-chat';

            Logger.debug('DeepSeekProvider: Making API request', { model, promptLength: prompt.length });

            const response = await requestWithRetry(
                'DeepSeekProvider.makeRequest',
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

            Logger.debug('DeepSeekProvider: API response received', { status: response.status });
            return response.data;
        } catch (error) {
            Logger.error('DeepSeekProvider: API request failed', error);
            throw buildProviderError('DeepSeek API Error', error);
        }
    }
}
