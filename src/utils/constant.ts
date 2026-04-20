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
            'gemini-3-pro',
            'gemini-3-flash',
            'gemini-3-pro',
            'gemini-3-flash',
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.5-flash-lite',
            'gemini-2.5-flash-lite',
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

/**
 * Pre-validates if a model name is potentially valid for a provider.
 * For cloud providers with fixed model lists, checks against known models.
 * For local providers (Ollama, LM Studio), always returns valid (needs runtime check).
 * Returns { valid: true } or { valid: false, reason: string, validModels: string[] }
 */
export function preValidateModelFormat(
    providerId: string,
    model: string
): { valid: boolean; reason?: string; validModels?: string[] } {
    const trimmedModel = (model || '').trim();

    // Empty model is valid (will use default)
    if (!trimmedModel) {
        return { valid: true };
    }

    // Local providers need runtime validation (can't know available models without API call)
    if (isLocalProvider(providerId)) {
        return { valid: true };
    }

    // For cloud providers with fixed model lists, check against known models
    const validModels = getProviderModels(providerId);
    if (validModels.length === 0) {
        // Unknown provider or provider with dynamic models - defer to runtime validation
        return { valid: true };
    }

    // Check if model matches any known model (with normalization)
    const normalizedInput = trimmedModel.toLowerCase().replace(/[-_.]/g, '');
    const isValid = validModels.some(validModel => {
        const normalizedValid = validModel.toLowerCase().replace(/[-_.]/g, '');
        return normalizedValid === normalizedInput ||
               normalizedValid.includes(normalizedInput) ||
               normalizedInput.includes(normalizedValid);
    });

    if (!isValid) {
        return {
            valid: false,
            reason: `Model "${trimmedModel}" is not in the list of known models for ${getProviderDisplayName(providerId)}.`,
            validModels,
        };
    }

    return { valid: true };
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
    const rawModel = input.model || '';
    // For local providers, only use the model if it doesn't contain provider-specific prefixes
    const model = isLocalProvider(input.provider)
        ? (rawModel && !rawModel.match(/gemini|gpt|claude|moonshot/i) ? rawModel : '')
        : (input.model || defaultModel);
    const baseUrl = input.provider === 'ollama'
        ? (input.ollamaHost || getProviderBaseUrl('ollama'))
        ? (input.ollamaHost || getProviderBaseUrl('ollama'))
        : input.provider === 'lmstudio'
            ? (input.lmStudioHost || getProviderBaseUrl('lmstudio'))
            ? (input.lmStudioHost || getProviderBaseUrl('lmstudio'))
            : input.baseUrl;

    return {
        model,
        baseUrl,
    };
}
