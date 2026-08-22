import { describe, expect, it } from 'vitest';
import { messagesToResponsesInput, responsesOutputToMessage } from '../../src/llm/responses';
import type { ChatMessage } from '../../src/llm/types';

describe('messagesToResponsesInput', () => {
	it('lifts the first system message into instructions', () => {
		const result = messagesToResponsesInput([
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: 'hi' },
		]);
		expect(result.instructions).toBe('sys');
		expect(result.input).toEqual([{ type: 'message', role: 'user', content: 'hi' }]);
	});

	it('keeps later system messages in the input list', () => {
		const result = messagesToResponsesInput([
			{ role: 'system', content: 'first' },
			{ role: 'user', content: 'hi' },
			{ role: 'system', content: 'later' },
		]);
		expect(result.instructions).toBe('first');
		expect(result.input).toContainEqual({ type: 'message', role: 'system', content: 'later' });
	});

	it('echoes assistant providerItems and maps tool calls', () => {
		const withItems: ChatMessage[] = [
			{ role: 'assistant', content: '', providerItems: [{ type: 'reasoning', id: 'r1' }] },
		];
		expect(messagesToResponsesInput(withItems).input).toEqual([{ type: 'reasoning', id: 'r1' }]);

		const withCalls: ChatMessage[] = [
			{
				role: 'assistant',
				content: '',
				tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_notes', arguments: '{"q":"x"}' } }],
			},
			{ role: 'tool', content: 'hits', tool_call_id: 'c1' },
		];
		expect(messagesToResponsesInput(withCalls).input).toEqual([
			{ type: 'function_call', call_id: 'c1', name: 'search_notes', arguments: '{"q":"x"}' },
			{ type: 'function_call_output', call_id: 'c1', output: 'hits' },
		]);
	});
});

describe('responsesOutputToMessage', () => {
	it('collects text parts and maps function calls', () => {
		const { message, finishReason } = responsesOutputToMessage([
			{ type: 'reasoning', id: 'r' },
			{ type: 'function_call', call_id: 'c1', name: 'read_note', arguments: '{}' },
			{ type: 'message', content: [{ text: 'hello' }, { text: ' world' }] },
		]);
		expect(finishReason).toBe('tool_calls');
		expect(message.content).toBe('hello world');
		expect(message.tool_calls).toEqual([
			{ id: 'c1', type: 'function', function: { name: 'read_note', arguments: '{}' } },
		]);
		expect(message.providerItems).toEqual([
			{ type: 'reasoning', id: 'r' },
			{ type: 'function_call', call_id: 'c1', name: 'read_note', arguments: '{}' },
		]);
	});

	it('exposes reasoning summaries as thinking without dropping providerItems', () => {
		const { message, thinking } = responsesOutputToMessage([
			{
				type: 'reasoning',
				id: 'r',
				summary: [{ type: 'summary_text', text: 'Consider the vault.' }],
			},
			{ type: 'message', content: 'Done.' },
		]);
		expect(thinking).toBe('Consider the vault.');
		expect(message.content).toBe('Done.');
		expect(message.providerItems).toEqual([
			{
				type: 'reasoning',
				id: 'r',
				summary: [{ type: 'summary_text', text: 'Consider the vault.' }],
			},
		]);
	});

	it('uses empty content when there are tools but no text, and null when neither', () => {
		expect(responsesOutputToMessage([{ type: 'function_call', name: 'x', call_id: '1' }]).message.content).toBe(
			'',
		);
		expect(responsesOutputToMessage([]).message.content).toBeNull();
		expect(responsesOutputToMessage(undefined).message.content).toBeNull();
	});

	it('maps incomplete status to length', () => {
		expect(responsesOutputToMessage([{ type: 'message', content: 'cut' }], 'incomplete').finishReason).toBe(
			'length',
		);
		expect(responsesOutputToMessage([{ type: 'message', content: 'ok' }], 'completed').finishReason).toBe(
			'completed',
		);
	});
});
