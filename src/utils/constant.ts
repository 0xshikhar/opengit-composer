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
    | 'lmstudio'
    | 'kimi'
    | 'ollama';

export function isLocalProvider(providerId: string): boolean {
    return PROVIDERS.some(provider =>
        provider.id === providerId &&
        provider.requiresApiKey === false &&
        provider.baseUrl === 'baseUrl'
    );
}

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
        models: [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.5-flash-lite-preview-06-17',
            'gemini-2.0-flash',
        ],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    },
    {
        id: 'lmstudio',
        name: 'LM Studio',
        requiresApiKey: false,
        defaultModel: '',
        models: [],
        baseUrl: 'baseUrl',
        defaultBaseUrl: 'http://localhost:1234/v1',
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
        models: ['groq/compound', 'qwen-qwq-32b', 'deepseek-r1-distill-llama-70b', 'llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
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

export interface ProviderHostAndModelSelection {
    model: string;
    baseUrl?: string;
}

export interface ProviderHostAndModelInput {
    provider: string;
    model?: string;
    baseUrl?: string;
    ollamaHost?: string;
    lmStudioHost?: string;
}

export function resolveProviderHostAndModel(
    input: ProviderHostAndModelInput,
    defaultModel: string = ''
): ProviderHostAndModelSelection {
    const model = isLocalProvider(input.provider)
        ? (input.model || '')
        : (input.model || defaultModel);
    const baseUrl = input.provider === 'ollama'
        ? input.ollamaHost
        : input.provider === 'lmstudio'
            ? input.lmStudioHost
            : input.baseUrl;

    return {
        model,
        baseUrl,
    };
}
