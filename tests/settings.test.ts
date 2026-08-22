import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS, DEFAULT_OLLAMA_URL } from '../src/constants';
import { DEFAULT_SETTINGS, PROVIDER_LABELS } from '../src/settings';

describe('DEFAULT_SETTINGS', () => {
	it('uses openai defaults', () => {
		expect(DEFAULT_SETTINGS.provider).toBe('openai');
		expect(DEFAULT_SETTINGS.model).toBe(DEFAULT_MODELS.openai);
		expect(DEFAULT_SETTINGS.ollamaUrl).toBe(DEFAULT_OLLAMA_URL);
		expect(DEFAULT_SETTINGS.temperature).toBe(0.3);
		expect(DEFAULT_SETTINGS.maxTokens).toBe(2048);
		expect(DEFAULT_SETTINGS.ragEnabled).toBe(true);
		expect(DEFAULT_SETTINGS.maxChunks).toBe(8);
		expect(DEFAULT_SETTINGS.privacyAcknowledged).toBe(false);
		expect(DEFAULT_SETTINGS.debugMode).toBe(false);
		expect(DEFAULT_SETTINGS.showReplyMeta).toBe(true);
	});

	it('fills missing keys when merging partial saved data', () => {
		const merged = Object.assign({}, DEFAULT_SETTINGS, { model: 'custom', debugMode: true });
		expect(merged.model).toBe('custom');
		expect(merged.debugMode).toBe(true);
		expect(merged.ragEnabled).toBe(true);
		expect(merged.openaiApiKey).toBe('');
		expect(Object.keys(merged).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
	});

	it('labels every provider id', () => {
		expect(Object.keys(PROVIDER_LABELS).sort()).toEqual(['ollama', 'openai', 'openrouter']);
	});
});
