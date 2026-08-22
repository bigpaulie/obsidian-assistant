import { describe, expect, it } from 'vitest';
import {
	canonicalizeAssistantContent,
	extractReasoningFields,
	extractReasoningSummary,
	joinThinking,
	splitThinkTags,
} from '../../src/llm/thinking';

describe('splitThinkTags', () => {
	it('splits closed think blocks from the answer', () => {
		expect(splitThinkTags('<think>plan</think>\nHello')).toEqual({
			thinking: 'plan',
			content: '\nHello',
		});
	});

	it('keeps an unclosed think block in the thinking channel', () => {
		expect(splitThinkTags('<think>partial')).toEqual({
			thinking: 'partial',
			content: '',
		});
	});

	it('leaves plain content unchanged', () => {
		expect(splitThinkTags('just text')).toEqual({ thinking: '', content: 'just text' });
	});
});

describe('extractReasoningFields', () => {
	it('joins reasoning, reasoning_content, and thinking fields', () => {
		expect(
			extractReasoningFields({
				reasoning: 'a',
				reasoning_content: 'b',
				thinking: 'c',
			}),
		).toBe('a\nb\nc');
		expect(extractReasoningFields({ content: 'nope' })).toBe('');
	});
});

describe('extractReasoningSummary', () => {
	it('reads summary_text parts', () => {
		expect(
			extractReasoningSummary({
				type: 'reasoning',
				summary: [{ type: 'summary_text', text: 'why' }],
			}),
		).toBe('why');
	});
});

describe('canonicalizeAssistantContent', () => {
	it('keeps thinking off the visible content', () => {
		expect(
			canonicalizeAssistantContent({
				content: '<think>hidden</think>Visible',
				reasoning_content: 'field',
			}),
		).toEqual({ thinking: 'field\nhidden', content: 'Visible' });
	});
});

describe('joinThinking', () => {
	it('drops empty parts', () => {
		expect(joinThinking(' a ', '', undefined, 'b')).toBe('a\nb');
	});
});
