import { describe, expect, it } from 'vitest';
import { formatReplyMeta, parseUsage, sumUsage } from '../../src/llm/usage';

describe('parseUsage', () => {
	it('reads Chat Completions usage including reasoning tokens', () => {
		expect(
			parseUsage({
				usage: {
					prompt_tokens: 10,
					completion_tokens: 20,
					total_tokens: 30,
					completion_tokens_details: { reasoning_tokens: 5 },
				},
			}),
		).toEqual({
			promptTokens: 10,
			completionTokens: 20,
			totalTokens: 30,
			reasoningTokens: 5,
		});
	});

	it('reads Responses usage field names', () => {
		expect(
			parseUsage({
				input_tokens: 8,
				output_tokens: 2,
				output_tokens_details: { reasoning_tokens: 1 },
			}),
		).toEqual({
			promptTokens: 8,
			completionTokens: 2,
			totalTokens: 10,
			reasoningTokens: 1,
		});
	});

	it('returns undefined when no counts are present', () => {
		expect(parseUsage({ choices: [] })).toBeUndefined();
	});
});

describe('sumUsage', () => {
	it('adds counts across rounds and ignores missing slices', () => {
		expect(
			sumUsage([
				{ promptTokens: 10, completionTokens: 2, totalTokens: 12 },
				undefined,
				{ promptTokens: 3, completionTokens: 4, totalTokens: 7, reasoningTokens: 1 },
			]),
		).toEqual({
			promptTokens: 13,
			completionTokens: 6,
			totalTokens: 19,
			reasoningTokens: 1,
		});
	});
});

describe('formatReplyMeta', () => {
	it('shows model only when usage is missing', () => {
		expect(formatReplyMeta('gpt-4o-mini')).toBe('gpt-4o-mini');
	});

	it('shows prompt and completion when both are present', () => {
		expect(formatReplyMeta('gpt-4o-mini', { promptTokens: 800, completionTokens: 434, totalTokens: 1234 })).toBe(
			'gpt-4o-mini · 800 → 434 tokens',
		);
	});

	it('appends reasoning tokens', () => {
		expect(
			formatReplyMeta('o3-mini', {
				promptTokens: 10,
				completionTokens: 20,
				totalTokens: 30,
				reasoningTokens: 8,
			}),
		).toBe('o3-mini · 10 → 20 tokens (8 thinking)');
	});
});
