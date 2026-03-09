import { AIProvider, AIProviderConfig } from './aiProvider';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { KimiProvider } from './providers/kimi';
import { OllamaProvider } from './providers/ollama';

export class AIProviderFactory {
    static create(providerName: string, config: AIProviderConfig): AIProvider {
        switch (providerName) {
            case 'openai':
                return new OpenAIProvider(config);
            case 'anthropic':
                return new AnthropicProvider(config);
            case 'gemini':
                return new GeminiProvider(config);
            case 'kimi':
                return new KimiProvider(config);
            case 'ollama':
                return new OllamaProvider(config);
            default:
                throw new Error(`Unknown AI provider: ${providerName}. Supported: openai, anthropic, gemini, kimi, ollama`);
        }
    }

    static getSupportedProviders(): string[] {
        return ['openai', 'anthropic', 'gemini', 'kimi', 'ollama'];
    }

    static getDefaultModel(providerName: string): string {
        switch (providerName) {
            case 'openai': return 'gpt-4o';
            case 'anthropic': return 'claude-sonnet-4-20250514';
            case 'gemini': return 'gemini-2.5-flash';
            case 'kimi': return 'moonshot-v1-8k';
            case 'ollama': return 'llama3.2';
            default: return '';
        }
    }
}
