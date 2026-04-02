import axios from 'axios';
import { Logger } from '../../utils/logger';

const RETRIABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRIABLE_CODES = new Set([
    'ECONNABORTED',
    'ECONNRESET',
    'ENETDOWN',
    'ENETUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPROTO',
    'ERR_NETWORK',
    'ERR_BAD_RESPONSE',
    'ETIMEDOUT',
]);
const RETRIABLE_PATTERNS = [
    /ssl.*bad[_ -]?record[_ -]?mac/i,
    /socket hang up/i,
    /network error/i,
    /timeout/i,
    /temporarily unavailable/i,
    /rate limit/i,
    /connection reset/i,
    /tls/i,
];

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isRetriableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;

    const status = error.response?.status;
    if (status && RETRIABLE_STATUS.has(status)) {
        return true;
    }

    const code = error.code || '';
    if (RETRIABLE_CODES.has(code)) {
        return true;
    }

    const responseMessage = typeof error.response?.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response?.data || {});
    const joinedMessage = `${error.message || ''} ${responseMessage}`;
    return RETRIABLE_PATTERNS.some(pattern => pattern.test(joinedMessage));
}

export async function requestWithRetry<T>(
    label: string,
    execute: () => Promise<T>,
    maxAttempts: number = 3
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await execute();
        } catch (error) {
            lastError = error;
            if (attempt >= maxAttempts || !isRetriableError(error)) {
                throw error;
            }

            const backoffMs = Math.min(4000, 400 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 120);
            Logger.warn(`${label}: transient AI request failure; retrying`, {
                attempt,
                maxAttempts,
                backoffMs,
                code: axios.isAxiosError(error) ? error.code : undefined,
                status: axios.isAxiosError(error) ? error.response?.status : undefined,
                message: error instanceof Error ? error.message : String(error),
            });
            await sleep(backoffMs);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function normalizeModelId(model: string): string {
    return model
        .trim()
        .replace(/^publishers\/[^/]+\/models\//, '')
        .replace(/^models\//, '');
}

export function modelIdsMatch(selectedModel: string, availableModel: string): boolean {
    const selected = normalizeModelId(selectedModel);
    const available = normalizeModelId(availableModel);
    return available === selected || available.endsWith(`/${selected}`) || available.endsWith(selected);
}

export function extractModelIds(payload: unknown): string[] {
    const normalizedPayload = payload as { data?: unknown; models?: unknown };
    const items = Array.isArray(normalizedPayload?.data)
        ? normalizedPayload.data
        : Array.isArray(normalizedPayload?.models)
            ? normalizedPayload.models
            : [];

    return items
        .map((item: any) => item?.id || item?.name)
        .filter(Boolean)
        .map((model: string) => normalizeModelId(model));
}

export function buildProviderError(prefix: string, error: unknown): Error {
    if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as any;
        const apiMessage =
            responseData?.error?.message ||
            responseData?.message ||
            (typeof responseData === 'string' ? responseData : undefined);
        const message = apiMessage || error.message;
        return new Error(`${prefix}: ${message}`);
    }

    if (error instanceof Error) {
        return new Error(`${prefix}: ${error.message}`);
    }

    return new Error(`${prefix}: ${String(error)}`);
}
