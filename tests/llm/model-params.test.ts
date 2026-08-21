import { describe, expect, it } from 'vitest';
import {
	chatCompletionsReasoningEffort,
	completionSampling,
	usesResponsesApi,
} from '../../src/llm/model-params';
import type { ChatMessage } from '../../src/llm/types';

describe('completionSampling', () => {
	it('uses temperature + max_tokens for gpt-4o and gpt-3.5 families', () => {
		expect(completionSampling('gpt-4o-mini', 0.2, 100)).toEqual({
			temperature: 0.2,
			max_tokens: 100,
		});
		expect(completionSampling('openai/gpt-4-turbo', 0.1, 50)).toEqual({
			temperature: 0.1,
			max_tokens: 50,
		});
	});

	it('uses temperature + max_completion_tokens for gpt-4.1', () => {
		expect(completionSampling('gpt-4.1', 0.3, 200)).toEqual({
			temperature: 0.3,
			max_completion_tokens: 200,
		});
	});

	it('omits temperature for o-series and gpt-5', () => {
		expect(completionSampling('o3-mini', 0.7, 80)).toEqual({ max_completion_tokens: 80 });
		expect(completionSampling('gpt-5.4', 0.7, 80)).toEqual({ max_completion_tokens: 80 });
	});
});

describe('usesResponsesApi', () => {
	const empty: ChatMessage[] = [{ role: 'user', content: 'hi' }];

	it('is true for OpenAI gpt-5.4+ when tools are present', () => {
		expect(usesResponsesApi('openai', 'gpt-5.4', { hasTools: true, messages: empty })).toBe(true);
		expect(usesResponsesApi('openai', 'gpt-5.6-sol', { hasTools: true, messages: empty })).toBe(true);
		expect(usesResponsesApi('openai', 'openai/gpt-5.5', { hasTools: true, messages: empty })).toBe(true);
	});

	it('stays on Responses for follow-up turns that already have tool items', () => {
		const withTools: ChatMessage[] = [
			{ role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
		];
		expect(usesResponsesApi('openai', 'gpt-5.4', { hasTools: false, messages: withTools })).toBe(true);
		expect(
			usesResponsesApi('openai', 'gpt-5.4', {
				hasTools: false,
				messages: [{ role: 'assistant', content: '', providerItems: [{ type: 'reasoning' }] }],
			}),
		).toBe(true);
	});

	it('is false for other providers, older OpenAI models, and tool-free first turns', () => {
		expect(usesResponsesApi('openrouter', 'gpt-5.4', { hasTools: true, messages: empty })).toBe(false);
		expect(usesResponsesApi('openai', 'gpt-4o-mini', { hasTools: true, messages: empty })).toBe(false);
		expect(usesResponsesApi('openai', 'gpt-5.4', { hasTools: false, messages: empty })).toBe(false);
	});
});

describe('chatCompletionsReasoningEffort', () => {
	it('sets none for OpenRouter gpt-5.4+ with tools', () => {
		expect(chatCompletionsReasoningEffort('openrouter', 'gpt-5.4', true)).toBe('none');
		expect(chatCompletionsReasoningEffort('openrouter', 'gpt-5.6-sol', true)).toBe('none');
		expect(chatCompletionsReasoningEffort('openrouter', 'gpt-5.4', false)).toBeUndefined();
		expect(chatCompletionsReasoningEffort('openai', 'gpt-5.4', true)).toBeUndefined();
		expect(chatCompletionsReasoningEffort('openrouter', 'gpt-4o', true)).toBeUndefined();
	});
});
