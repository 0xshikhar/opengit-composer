import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import {
    buildProviderError,
    extractGeminiContent,
    extractModelIds,
    modelIdsMatch,
    normalizeModelId,
    requestWithRetry,
} from './providerUtils';
import { getProviderDefaultModel, getProviderModelOptions } from '../../utils/constant';

export class GoogleProvider extends AIProvider {
    private readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';

    constructor(config: AIProviderConfig) {
        super(config);
        Logger.info('GoogleProvider initialized', { model: config.model });
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info('GoogleProvider: Analyzing changes', { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        Logger.debug('GoogleProvider: Built prompt', { promptLength: prompt.length });

        const response = await this.makeRequest(prompt);
        const content = extractGeminiContent(response, 'Google');
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('GoogleProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        const repairContent = extractGeminiContent(repairResponse, 'Google');
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        Logger.info('GoogleProvider: Generating commit message', { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        return ResponseParser.parseMessageResponse(
            extractGeminiContent(response, 'Google')
        );
    }

    async validateApiKey(): Promise<boolean> {
        try {
            Logger.info('GoogleProvider: Validating API key');
            await this.makeRequest('Test');
            Logger.info('GoogleProvider: API key validation successful');
            return true;
        } catch (error) {
            Logger.error('GoogleProvider: API key validation failed', error);
            return false;
        }
    }

    async validateModelAvailability(): Promise<{ available: boolean; reason?: string; models?: string[] }> {
        const selectedModel = normalizeModelId(this.config.model || getProviderDefaultModel('google'));
        const fallbackModels = [...getProviderModelOptions('google')];
        try {
            const response = await axios.get(`${this.endpoint}?key=${this.config.apiKey}`, { timeout: 5000 });
            const models = extractModelIds(response.data);
            const availableModels = models.length > 0 ? models : fallbackModels;
            if (!availableModels.some(model => modelIdsMatch(selectedModel, model))) {
                return {
                    available: false,
                    reason: `Model "${selectedModel}" is not listed for this Google API key.`,
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
            const model = this.config.model || getProviderDefaultModel('google');
            const url = `${this.endpoint}/${model}:generateContent?key=${this.config.apiKey}`;

            Logger.debug('GoogleProvider: Making API request', {
                model,
                endpoint: this.endpoint,
                promptLength: prompt.length
            });

            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: this.config.temperature || 0.3,
                    maxOutputTokens: this.config.maxTokens || 2000
                }
            };

            Logger.debug('GoogleProvider: Request body', requestBody);

            const response = await requestWithRetry(
                'GoogleProvider.makeRequest',
                () => axios.post(
                    url,
                    requestBody,
                    {
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        timeout: 45000
                    }
                ),
                3
            );

            Logger.debug('GoogleProvider: API response received', {
                status: response.status,
                data: response.data
            });

            return response.data;
        } catch (error) {
            Logger.error('GoogleProvider: Unexpected error', error);
            throw buildProviderError('Google API Error', error);
        }
    }
}
