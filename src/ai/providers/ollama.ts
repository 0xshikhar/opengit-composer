import axios from 'axios';
import { AIAnalyzeOptions, AIProvider, AIProviderConfig, AIResponse } from '../aiProvider';
import { FileChange } from '../../types/git';
import { PromptBuilder } from '../promptBuilder';
import { ResponseParser } from '../responseParser';
import { Logger } from '../../utils/logger';
import { buildProviderError, extractModelIds, modelIdsMatch, requestWithRetry } from './providerUtils';

/**
 * Ollama provider — local model inference via REST API.
 */
export class OllamaProvider extends AIProvider {
    private readonly baseUrl: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        // Warn if baseUrl doesn't look like Ollama (typically port 11434 or /api path)
        if (this.baseUrl && !this.baseUrl.includes('11434') && !this.baseUrl.includes('/api')) {
            Logger.warn('OllamaProvider initialized with non-standard baseUrl', { baseUrl: this.baseUrl });
        }
        Logger.info('OllamaProvider initialized', { model: config.model, baseUrl: this.baseUrl });
    }

    async analyzeChanges(changes: FileChange[], options?: AIAnalyzeOptions): Promise<AIResponse> {
        Logger.info('OllamaProvider: Analyzing changes', { fileCount: changes.length });
        const prompt = PromptBuilder.buildGroupingPrompt(changes, options);
        const response = await this.makeRequest(prompt);

        const content = response.message?.content || response.response || '';
        const parsed = ResponseParser.parseGroupingResponse(content, changes);
        if (!parsed.parserMeta?.usedFallback || !content.trim()) {
            return parsed;
        }

        Logger.warn('OllamaProvider: Initial parse used fallback, attempting repair pass');
        const repairPrompt = PromptBuilder.buildRepairPrompt(content, changes, options);
        const repairResponse = await this.makeRequest(repairPrompt);
        const repairContent = repairResponse.message?.content || repairResponse.response || '';
        const repaired = ResponseParser.parseGroupingResponse(repairContent, changes);
        return repaired.parserMeta?.usedFallback ? parsed : repaired;
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
            await requestWithRetry(
                'OllamaProvider.validateApiKey',
                () => axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 }),
                2
            );
            return true;
        } catch (error) {
            Logger.error('OllamaProvider: Server not reachable', error);
            return false;
        }
    }

    async validateModelAvailability(): Promise<{ available: boolean; reason?: string; models?: string[] }> {
        const selectedModel = (this.config.model || 'llama3.2').trim();
        const models = await this.getAvailableModels();
        if (models.length === 0) {
            return {
                available: false,
                reason: 'Ollama server is reachable, but no models were reported. Pull or load a model before composing.',
                models,
            };
        }
        if (!models.some(model => modelIdsMatch(selectedModel, model))) {
            return {
                available: false,
                reason: `Model "${selectedModel}" is not available on the configured Ollama server.`,
                models,
            };
        }
        return { available: true, models };
    }

    async getAvailableModels(): Promise<string[]> {
        try {
            Logger.info('OllamaProvider: Fetching available models');
            const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 10000 });
            return extractModelIds(response.data);
        } catch (error) {
            Logger.error('OllamaProvider: Failed to fetch models', error);
            return [];
        }
    }

    protected async makeRequest(prompt: string): Promise<any> {
        try {
            const model = this.config.model || 'llama3.2';

            Logger.debug('OllamaProvider: Making API request', { model, promptLength: prompt.length });

            const response = await requestWithRetry(
                'OllamaProvider.makeRequest',
                () => axios.post(
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
                            temperature: this.config.temperature || 0.2,
                            num_predict: this.config.maxTokens || 3000,
                        },
                        format: 'json',
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        // Extended timeout for local models (10 minutes)
                        // Local LLMs with reasoning can be very slow
                        timeout: 600000,
                    }
                ),
                2
            );

            Logger.debug('OllamaProvider: API response received', { status: response.status });
            return response.data;
        } catch (error) {
            Logger.error('OllamaProvider: API request failed', error);
            throw buildProviderError('Ollama Error', error);
        }
    }
}
