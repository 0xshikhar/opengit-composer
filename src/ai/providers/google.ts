import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import { buildProviderError, requestWithRetry } from './providerUtils';

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
        const content = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('GoogleProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        const repairContent = repairResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        Logger.info('GoogleProvider: Generating commit message', { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        return ResponseParser.parseMessageResponse(
            response.candidates[0].content.parts[0].text
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

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const model = this.config.model || 'gemini-2.5-flash';
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
