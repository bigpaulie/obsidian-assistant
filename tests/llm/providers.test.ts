import { describe, expect, it } from 'vitest';
import { DEFAULT_OLLAMA_URL } from '../../src/constants';
import {
	getApiKeyForProvider,
	isLocalhostUrl,
	normalizeServerUrl,
	resolveProviderConfig,
	toApiBaseUrl,
} from '../../src/llm/providers';
import { DEFAULT_SETTINGS, type VaultAssistantSettings } from '../../src/settings';

describe('normalizeServerUrl', () => {
	it('accepts http(s) origins and strips a trailing slash', () => {
		expect(normalizeServerUrl(' https://example.com/ ')).toBe('https://example.com');
		expect(normalizeServerUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
	});

	it('rejects empty, non-http, and credentialed URLs', () => {
		expect(normalizeServerUrl('')).toBeNull();
		expect(normalizeServerUrl('not a url')).toBeNull();
		expect(normalizeServerUrl('ftp://example.com')).toBeNull();
		expect(normalizeServerUrl('https://user:pass@example.com')).toBeNull();
	});
});

describe('toApiBaseUrl', () => {
	it('appends /v1 unless it is already present', () => {
		expect(toApiBaseUrl('http://localhost:11434')).toBe('http://localhost:11434/v1');
		expect(toApiBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
		expect(toApiBaseUrl('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1');
	});
});

describe('isLocalhostUrl', () => {
	it('detects loopback hosts', () => {
		expect(isLocalhostUrl('http://localhost:11434')).toBe(true);
		expect(isLocalhostUrl('http://127.0.0.1/v1')).toBe(true);
		expect(isLocalhostUrl('https://api.openai.com')).toBe(false);
		expect(isLocalhostUrl('not-a-url')).toBe(false);
	});
});

describe('resolveProviderConfig', () => {
	it('builds OpenAI and OpenRouter configs with bearer headers', () => {
		const openai = resolveProviderConfig({
			...DEFAULT_SETTINGS,
			provider: 'openai',
			openaiApiKey: 'sk-test',
		});
		expect(openai.apiBaseUrl).toBe('https://api.openai.com/v1');
		expect(openai.requiresKey).toBe(true);
		expect(openai.headers.Authorization).toBe('Bearer sk-test');

		const openrouter = resolveProviderConfig({
			...DEFAULT_SETTINGS,
			provider: 'openrouter',
			openrouterApiKey: 'or-key',
		});
		expect(openrouter.apiBaseUrl).toBe('https://openrouter.ai/api/v1');
		expect(openrouter.headers['HTTP-Referer']).toBe('https://obsidian.md');
		expect(openrouter.headers.Authorization).toBe('Bearer or-key');
	});

	it('falls back to the default Ollama URL and a placeholder bearer token', () => {
		const config = resolveProviderConfig({
			...DEFAULT_SETTINGS,
			provider: 'ollama',
			ollamaUrl: 'not-valid',
			ollamaApiKey: '  ',
		});
		expect(config.apiBaseUrl).toBe(`${DEFAULT_OLLAMA_URL}/v1`);
		expect(config.requiresKey).toBe(false);
		expect(config.headers.Authorization).toBe('Bearer ollama');
	});
});

describe('getApiKeyForProvider', () => {
	it('returns the key field for the selected provider', () => {
		const settings: VaultAssistantSettings = {
			...DEFAULT_SETTINGS,
			openaiApiKey: 'oa',
			openrouterApiKey: 'or',
			ollamaApiKey: 'ol',
		};
		expect(getApiKeyForProvider({ ...settings, provider: 'openai' })).toBe('oa');
		expect(getApiKeyForProvider({ ...settings, provider: 'openrouter' })).toBe('or');
		expect(getApiKeyForProvider({ ...settings, provider: 'ollama' })).toBe('ol');
	});
});
