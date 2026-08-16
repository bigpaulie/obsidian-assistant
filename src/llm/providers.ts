import { DEFAULT_OLLAMA_URL } from '../constants';
import type { ProviderId, VaultAssistantSettings } from '../settings';

export interface ProviderConfig {
	id: ProviderId;
	apiBaseUrl: string;
	headers: Record<string, string>;
	requiresKey: boolean;
}

/**
 * Validate an http(s) origin. Rejects credentials in the URL.
 * Strips a trailing slash. Returns null when invalid.
 */
export function normalizeServerUrl(raw: string): string | null {
	const trimmed = raw.trim().replace(/\/+$/, '');
	if (!trimmed) {
		return null;
	}
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return null;
	}
	if (parsed.username || parsed.password) {
		return null;
	}
	return trimmed;
}

export function toApiBaseUrl(serverUrl: string): string {
	const normalized = serverUrl.replace(/\/+$/, '');
	if (normalized.endsWith('/v1')) {
		return normalized;
	}
	return `${normalized}/v1`;
}

export function isLocalhostUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname;
		return host === 'localhost' || host === '127.0.0.1' || host === '::1';
	} catch {
		return false;
	}
}

export function resolveProviderConfig(settings: VaultAssistantSettings): ProviderConfig {
	switch (settings.provider) {
		case 'openai':
			return {
				id: 'openai',
				apiBaseUrl: 'https://api.openai.com/v1',
				headers: bearerHeaders(settings.openaiApiKey),
				requiresKey: true,
			};
		case 'openrouter':
			return {
				id: 'openrouter',
				apiBaseUrl: 'https://openrouter.ai/api/v1',
				headers: {
					...bearerHeaders(settings.openrouterApiKey),
					'HTTP-Referer': 'https://obsidian.md',
					'X-Title': 'Vault Assistant',
				},
				requiresKey: true,
			};
		case 'ollama': {
			const server = normalizeServerUrl(settings.ollamaUrl) ?? DEFAULT_OLLAMA_URL;
			const key = settings.ollamaApiKey.trim();
			return {
				id: 'ollama',
				apiBaseUrl: toApiBaseUrl(server),
				headers: bearerHeaders(key || 'ollama'),
				requiresKey: false,
			};
		}
	}
}

export function getApiKeyForProvider(settings: VaultAssistantSettings): string {
	switch (settings.provider) {
		case 'openai':
			return settings.openaiApiKey;
		case 'openrouter':
			return settings.openrouterApiKey;
		case 'ollama':
			return settings.ollamaApiKey;
	}
}

function bearerHeaders(apiKey: string): Record<string, string> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	const key = apiKey.trim();
	if (key) {
		headers.Authorization = `Bearer ${key}`;
	}
	return headers;
}
