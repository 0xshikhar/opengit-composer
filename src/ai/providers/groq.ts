import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { buildProviderError, extractModelIds, modelIdsMatch, requestWithRetry } from './providerUtils';
import { getProviderDefaultModel, getProviderModelOptions } from '../../utils/constant';

export class GroqProvider extends AIProvider {
    private readonly endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    constructor(config: AIProviderConfig) {
        super(config);
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        const response = await this.makeRequest(prompt);
        const content = response?.choices?.[0]?.message?.content || '';
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        const repairContent = repairResponse?.choices?.[0]?.message?.content || '';
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        return ResponseParser.parseMessageResponse(
            response.choices[0].message.content
        );
    }

    async validateApiKey(): Promise<boolean> {
        try {
            await requestWithRetry(
                'GroqProvider.validateApiKey',
                () => axios.get('https://api.groq.com/openai/v1/models', {
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`
                    },
                    timeout: 5000
                }),
                2
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    async validateModelAvailability(): Promise<{ available: boolean; reason?: string; models?: string[] }> {
        const selectedModel = (this.config.model || getProviderDefaultModel('groq')).trim();
        const fallbackModels = [...getProviderModelOptions('groq')];
        try {
            const response = await axios.get('https://api.groq.com/openai/v1/models', {
                headers: {
                    Authorization: `Bearer ${this.config.apiKey}`,
                },
                timeout: 5000,
            });
            const models = extractModelIds(response.data);
            const availableModels = models.length > 0 ? models : fallbackModels;
            if (!availableModels.some(model => modelIdsMatch(selectedModel, model))) {
                return {
                    available: false,
                    reason: `Model "${selectedModel}" is not available for this Groq key.`,
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

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const response = await requestWithRetry(
                'GroqProvider.makeRequest',
                () => axios.post(
                    this.endpoint,
                    {
                        model: this.config.model || getProviderDefaultModel('groq'),
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
                        temperature: this.config.temperature || 0.2,
                        max_tokens: this.config.maxTokens || 3000,
                        response_format: { type: 'json_object' }
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

            return response.data;
        } catch (error) {
            throw buildProviderError('Groq API Error', error);
        }
    }
}
