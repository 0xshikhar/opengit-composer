import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import { buildProviderError, requestWithRetry } from './providerUtils';

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

        const content = response.choices[0].message.content;
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('KimiProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        const repairContent = repairResponse.choices?.[0]?.message?.content || '';
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        Logger.info('KimiProvider: Generating commit message', { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        return ResponseParser.parseMessageResponse(
            response.choices[0].message.content
        );
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
