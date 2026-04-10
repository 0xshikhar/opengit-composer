import { AIProvider, AIProviderConfig } from './aiProvider';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GroqProvider } from './providers/groq';
import { GeminiProvider } from './providers/gemini';
import { LMStudioProvider } from './providers/lmstudio';
import { KimiProvider } from './providers/kimi';
import { OllamaProvider } from './providers/ollama';
import { ProviderName, getProviderDefaultModel } from '../utils/constant';

export class AIProviderFactory {
    static create(providerName: string, config: AIProviderConfig): AIProvider {
        switch (providerName) {
            case 'openai':
                return new OpenAIProvider(config);
            case 'anthropic':
                return new AnthropicProvider(config);
            case 'groq':
                return new GroqProvider(config);
            case 'google':
            case 'gemini':
                return new GeminiProvider(config);
            case 'lmstudio':
                return new LMStudioProvider(config);
            case 'kimi':
                return new KimiProvider(config);
            case 'ollama':
                return new OllamaProvider(config);
            default:
                throw new Error(`Unknown AI provider: ${providerName}. Supported: openai, anthropic, gemini, lmstudio, kimi, ollama`);
        }
    }

    static getSupportedProviders(): string[] {
        return ['openai', 'anthropic', 'groq', 'gemini', 'google', 'lmstudio', 'kimi', 'ollama'];
    }

    static getDefaultModel(providerName: string): string {
        return getProviderDefaultModel(providerName as ProviderName);
    }
}
