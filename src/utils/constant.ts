export interface ProviderInfo {
    id: string;
    name: string;
    requiresApiKey: boolean;
    defaultModel: string;
    models: string[];
    baseUrl?: string;
    defaultBaseUrl?: string;
}

export type ProviderName =
    | 'openai'
    | 'anthropic'
    | 'groq'
    | 'gemini'
    | 'kimi'
    | 'ollama';

export const PROVIDERS: ProviderInfo[] = [
    {
        id: 'openai',
        name: 'OpenAI',
        requiresApiKey: true,
        defaultModel: 'gpt-4o',
        models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4o'],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.openai.com/v1',
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        requiresApiKey: true,
        defaultModel: 'claude-haiku-4-5',
        models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.anthropic.com',
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        requiresApiKey: true,
        defaultModel: 'gemini-2.5-flash',
        models: ['gemini-3-flash', 'gemini-3.1-pro', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    },
    {
        id: 'kimi',
        name: 'Kimi (Moonshot)',
        requiresApiKey: true,
        defaultModel: 'moonshot-v1-8k',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.moonshot.cn/v1',
    },
    {
        id: 'groq',
        name: 'Groq',
        requiresApiKey: true,
        defaultModel: 'groq/compound',
        models: ['groq/compound', 'qwen-qwq-32b', 'deepseek-r1-distill-llama-70b'],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.groq.com/openai/v1',
    },
    {
        id: 'groq',
        name: 'Groq',
        requiresApiKey: true,
        defaultModel: 'llama3-70b-8192',
        models: ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.groq.com/openai/v1',
    },
    {
        id: 'ollama',
        name: 'Ollama (Local)',
        requiresApiKey: false,
        defaultModel: '',
        models: [], // Populated at runtime
        baseUrl: 'baseUrl',
        defaultBaseUrl: 'http://localhost:11434',
    },
];

export function getProviderInfo(providerId: string): ProviderInfo | undefined {
    return PROVIDERS.find(p => p.id === providerId);
}

export function getProviderDisplayName(providerId: string): string {
    return getProviderInfo(providerId)?.name || providerId;
}

export function getProviderModels(providerId: string): string[] {
    const provider = getProviderInfo(providerId);
    return provider?.models || [];
}

export function getProviderDefaultModel(providerId: string): string {
    const provider = getProviderInfo(providerId);
    return provider?.defaultModel || '';
}

export function getProviderModelOptions(providerId: string): readonly string[] {
    return getProviderModels(providerId);
}

export function getProviderBaseUrl(providerId: string): string | undefined {
    const provider = getProviderInfo(providerId);
    return provider?.defaultBaseUrl;
}

export function requiresApiKey(providerId: string): boolean {
    const provider = getProviderInfo(providerId);
    return provider?.requiresApiKey ?? true;
}
