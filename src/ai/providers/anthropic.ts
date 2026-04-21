import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse, GenerateMessageOptions } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import { buildProviderError, extractModelIds, modelIdsMatch, requestWithRetry } from './providerUtils';
import { getProviderDefaultModel, getProviderModelOptions } from '../../utils/constant';

export class AnthropicProvider extends AIProvider {
    private readonly endpoint = 'https://api.anthropic.com/v1/messages';
    private readonly modelsEndpoint = 'https://api.anthropic.com/v1/models';

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info('AnthropicProvider: Analyzing changes', { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        const response = await this.makeRequest(prompt);
        const content = response.content?.[0]?.text || '';
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('AnthropicProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        const repairContent = repairResponse.content?.[0]?.text || '';
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[], options?: GenerateMessageOptions): Promise<string> {
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        return ResponseParser.parseMessageResponse(response.content[0].text);
    }

    async validateApiKey(): Promise<boolean> {
        try {
            await requestWithRetry(
                'AnthropicProvider.validateApiKey',
                () => axios.get('https://api.anthropic.com/v1/models', {
                    headers: {
                        'x-api-key': this.config.apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    timeout: 5000,
                }),
                2
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    async validateModelAvailability(): Promise<{ available: boolean; reason?: string; models?: string[] }> {
        const selectedModel = (this.config.model || getProviderDefaultModel('anthropic')).trim();
        try {
            const response = await axios.get(this.modelsEndpoint, {
                headers: {
                    'x-api-key': this.config.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                timeout: 5000,
            });
            const models = extractModelIds(response.data);
            const fallbackModels = [...getProviderModelOptions('anthropic')];
            if (models.length > 0 && !models.some(model => modelIdsMatch(selectedModel, model))) {
                return {
                    available: false,
                    reason: `Model "${selectedModel}" is not available for this Anthropic key.`,
                    models,
                };
            }
            return { available: true, models: models.length > 0 ? models : fallbackModels };
        } catch (error) {
            return {
                available: false,
                reason: error instanceof Error ? error.message : 'Unable to verify model availability.',
            };
        }
    }

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const response = await requestWithRetry(
                'AnthropicProvider.makeRequest',
                () => axios.post(
                    this.endpoint,
                    {
                        model: this.config.model || getProviderDefaultModel('anthropic'),
                        max_tokens: this.config.maxTokens || 3000,
                        messages: [
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: this.config.temperature || 0.2
                    },
                    {
                        headers: {
                            'x-api-key': this.config.apiKey,
                            'anthropic-version': '2023-06-01',
                            'Content-Type': 'application/json'
                        },
                        timeout: 45000
                    }
                ),
                3
            );

            return response.data;
        } catch (error) {
            throw buildProviderError('Anthropic API Error', error);
        }
    }
}
