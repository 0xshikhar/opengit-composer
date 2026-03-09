import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import { buildProviderError, requestWithRetry } from './providerUtils';

export class OpenAIProvider extends AIProvider {
    private readonly endpoint = 'https://api.openai.com/v1/chat/completions';
    private readonly providerName = 'OpenAI';

    constructor(config: AIProviderConfig) {
        super(config);
        Logger.info('OpenAIProvider initialized', { model: config.model });
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info(`[${this.providerName}] Analyzing changes`, { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        
        const startTime = Date.now();
        Logger.aiRequest(this.providerName, this.config.model || 'gpt-4o', prompt.length);

        let response;
        try {
            response = await this.makeRequest(prompt);
        } catch (error) {
            Logger.aiError(this.providerName, error);
            throw error;
        }

        const responseTime = Date.now() - startTime;
        
        // OpenAI's chat completion format
        const content = response.choices[0].message.content;
        
        Logger.aiResponse(this.providerName, 200, content.length, responseTime);
        Logger.aiRawResponse(content);
        
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('OpenAIProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        const repairContent = repairResponse.choices?.[0]?.message?.content || '';
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        Logger.info(`[${this.providerName}] Generating commit message`, { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);

        const response = await this.makeRequest(prompt);
        const content = response.choices[0].message.content;
        
        Logger.aiRawResponse(content);
        
        return ResponseParser.parseMessageResponse(content);
    }

    async validateApiKey(): Promise<boolean> {
        try {
            Logger.info(`[${this.providerName}] Validating API key`);
            await requestWithRetry(
                'OpenAIProvider.validateApiKey',
                () => axios.get('https://api.openai.com/v1/models', {
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`
                    },
                    timeout: 5000
                }),
                2
            );
            Logger.info(`[${this.providerName}] API key validation successful`);
            return true;
        } catch (error) {
            Logger.error(`[${this.providerName}] API key validation failed`, error);
            return false;
        }
    }

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const model = this.config.model || 'gpt-4o';

            const requestBody = {
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert at organizing code changes into git commits. You MUST respond with ONLY valid JSON. Never use markdown code blocks.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: this.config.temperature || 0.2,
                max_tokens: this.config.maxTokens || 4000,
                response_format: { type: 'json_object' }
            };

            Logger.debug('Request body', { model });

            const response = await requestWithRetry(
                'OpenAIProvider.makeRequest',
                () => axios.post(
                    this.endpoint,
                    requestBody,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.config.apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 60000
                    }
                ),
                3
            );

            return response.data;
        } catch (error) {
            Logger.error(`[${this.providerName}] Unexpected error`, error);
            throw buildProviderError('OpenAI API Error', error);
        }
    }
}
