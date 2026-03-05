import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';

/**
 * Ollama provider — local model inference via REST API.
 */
export class OllamaProvider extends AIProvider {
    private readonly baseUrl: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        Logger.info('OllamaProvider initialized', { model: config.model, baseUrl: this.baseUrl });
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info('OllamaProvider: Analyzing changes', { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        const response = await this.makeRequest(prompt);

        const content = response.message?.content || response.response || '';
        return ResponseParser.parseGroupingResponse(content, changes);
    }

    async generateCommitMessage(files: FileChange[]): Promise<string> {
        Logger.info('OllamaProvider: Generating commit message', { fileCount: files.length });
        const prompt = PromptBuilder.buildMessagePrompt(files);
        const response = await this.makeRequest(prompt);

        const content = response.message?.content || response.response || '';
        return ResponseParser.parseMessageResponse(content);
    }

    async validateApiKey(): Promise<boolean> {
        try {
            Logger.info('OllamaProvider: Checking server availability');
            await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
            return true;
        } catch (error) {
            Logger.error('OllamaProvider: Server not reachable', error);
            return false;
        }
    }

    async getAvailableModels(): Promise<string[]> {
        try {
            Logger.info('OllamaProvider: Fetching available models');
            const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 10000 });
            const models = response.data.models || [];
            return models.map((m: { name: string }) => m.name);
        } catch (error) {
            Logger.error('OllamaProvider: Failed to fetch models', error);
            return [];
        }
    }

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const model = this.config.model || 'llama3.2';

            Logger.debug('OllamaProvider: Making API request', { model, promptLength: prompt.length });

            const response = await axios.post(
                `${this.baseUrl}/api/chat`,
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
                    stream: false,
                    options: {
                        temperature: this.config.temperature || 0.3,
                        num_predict: this.config.maxTokens || 2000,
                    },
                    format: 'json',
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 120000 // local models can be slow
                }
            );

            Logger.debug('OllamaProvider: API response received', { status: response.status });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                Logger.error('OllamaProvider: API request failed', {
                    status: error.response?.status,
                    data: error.response?.data,
                });
                throw new Error(
                    `Ollama Error: ${error.response?.data?.error || error.message}`
                );
            }
            throw error;
        }
    }
}
