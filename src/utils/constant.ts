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
    | 'deepseek'
    | 'ollama';

export interface LocalEndpointConfig {
    id: string;
    name: string;
    providerType: 'lmstudio' | 'ollama';
    baseUrl: string;
    model?: string;
    apiKey?: string;
    isPreset?: boolean;
}

export const DEFAULT_LOCAL_ENDPOINTS: LocalEndpointConfig[] = [
    {
        id: 'turbofieldfare',
        name: 'TurboFieldfare',
        providerType: 'lmstudio',
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: '',
        isPreset: true,
    },
    {
        id: 'lmstudio',
        name: 'LM Studio',
        providerType: 'lmstudio',
        baseUrl: 'http://localhost:1234/v1',
        model: '',
        isPreset: true,
    },
    {
        id: 'ollama',
        name: 'Ollama',
        providerType: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: '',
        isPreset: true,
    },
    {
        id: 'vllm',
        name: 'vLLM / llama.cpp',
        providerType: 'lmstudio',
        baseUrl: 'http://localhost:8000/v1',
        model: '',
        isPreset: true,
    },
];

export function isLocalProvider(providerId: string): boolean {
    return (
        providerId === 'lmstudio' ||
        providerId === 'ollama' ||
        PROVIDERS.some(
            provider =>
                provider.id === providerId &&
                provider.requiresApiKey === false &&
                provider.baseUrl === 'baseUrl'
        )
    );
}

export const PROVIDERS: ProviderInfo[] = [
    {
        id: 'openai',
        name: 'OpenAI',
        requiresApiKey: true,
        defaultModel: 'gpt-4o',
        models: [
            'chatgpt-6',
            'astra-v6',
            'gpt-5.4',
            'gpt-5.4-mini',
            'gpt-5.4-nano',
            'o3',
            'o3-mini',
            'o4-mini',
            'o1',
            'o1-mini',
            'gpt-4.5-preview',
            'gpt-4o',
            'gpt-4o-mini',
            'codex-mini',
            'gpt-4o-code',
            'gpt-4-turbo',
            'gpt-3.5-turbo',
        ],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.openai.com/v1',
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        requiresApiKey: true,
        defaultModel: 'claude-haiku-4-5',
        models: [
            'claude-opus-5',
            'claude-opus-4-6',
            'claude-3-opus-latest',
            'claude-3-opus-20240229',
            'claude-sonnet-4-6',
            'claude-3-7-sonnet-latest',
            'claude-3-5-sonnet-latest',
            'claude-3-5-sonnet-20241022',
            'claude-haiku-4-5',
            'claude-3-5-haiku-latest',
            'claude-3-5-haiku-20241022',
            'claude-3-haiku-20240307',
            'claude-fable-5',
        ],
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
            'gemini-2.5-pro',
            'gemini-2.0-pro-exp-02-05',
            'gemini-1.5-pro',
            'gemini-3-flash',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash-8b',
            'gemini-2.0-flash-thinking-exp',
        ],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    },
    {
        id: 'groq',
        name: 'Groq',
        requiresApiKey: true,
        defaultModel: 'groq/compound',
        models: [
            'groq/compound',
            'groq/compound-mini',
            'llama-3.3-70b-versatile',
            'llama-3.1-70b-versatile',
            'llama-3.1-8b-instant',
            'llama3-70b-8192',
            'llama3-8b-8192',
            'deepseek-r1-distill-llama-70b',
            'deepseek-r1-distill-qwen-32b',
            'qwen-qwq-32b',
            'qwen-2.5-coder-32b',
            'mistral-saba-24b',
            'mixtral-8x7b-32768',
            'gemma2-9b-it',
        ],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.groq.com/openai/v1',
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        requiresApiKey: true,
        defaultModel: 'deepseek-chat',
        models: [
            'deepseek-chat',
            'deepseek-reasoner',
            'deepseek-r1',
            'deepseek-r1-0528',
            'deepseek-v3',
            'deepseek-coder',
        ],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.deepseek.com',
    },
    {
        id: 'kimi',
        name: 'Kimi (Moonshot)',
        requiresApiKey: true,
        defaultModel: 'moonshot-v1-8k',
        models: ['moonshot-v1-auto', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'],
        baseUrl: 'apiKey',
        defaultBaseUrl: 'https://api.moonshot.cn/v1',
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
        : input.provider === 'lmstudio'
            ? (input.lmStudioHost || getProviderBaseUrl('lmstudio'))
            : input.baseUrl;

    return {
        model,
        baseUrl,
    };
}

export function normalizeModelId(model: string): string {
    return model
        .trim()
        .replace(/^publishers\/[^/]+\/models\//, '')
        .replace(/^models\//, '')
        .replace(/-(\d+)\.0+(?=-|$)/g, '-$1'); // Normalize version numbers like 3.0 -> 3
}

export function modelIdsMatch(selectedModel: string, availableModel: string): boolean {
    const selected = normalizeModelId(selectedModel);
    const available = normalizeModelId(availableModel);
    if (available === selected || available.endsWith(`/${selected}`) || available.endsWith(selected)) {
        return true;
    }

    // Handle file paths or extensions (e.g. scratch/gemma4.gturbo -> gemma4)
    const cleanName = (s: string) => s.split('/').pop()?.replace(/\.[^/.]+$/, '').replace(/[-_.]/g, '').toLowerCase() || '';
    const cleanSelected = cleanName(selected);
    const cleanAvailable = cleanName(available);

    if (cleanSelected && cleanAvailable) {
        if (cleanSelected === cleanAvailable || cleanAvailable.includes(cleanSelected) || cleanSelected.includes(cleanAvailable)) {
            return true;
        }
    }

    return false;
}

