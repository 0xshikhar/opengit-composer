import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import { buildProviderError, requestWithRetry } from './providerUtils';

export class AnthropicProvider extends AIProvider {
    private readonly endpoint = 'https://api.anthropic.com/v1/messages';

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

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        return ResponseParser.parseMessageResponse(response.content[0].text);
    }

    async validateApiKey(): Promise<boolean> {
        try {
            // Simple validation by making a small request
            // Note: Anthropic doesn't have a simple 'validate' endpoint like OpenAI's /models that is cheap/free always, 
            // but we can try a minimal request or just assume valid if structure is correct.
            // For now, let's try a minimal request.
            await this.makeRequest('Test');
            return true;
        } catch (error) {
            return false;
        }
    }

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const response = await requestWithRetry(
                'AnthropicProvider.makeRequest',
                () => axios.post(
                    this.endpoint,
                    {
                        model: this.config.model || 'claude-sonnet-4-20250514',
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
