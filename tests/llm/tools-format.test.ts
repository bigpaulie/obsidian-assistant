import { describe, expect, it } from 'vitest';
import { toChatCompletionsTools, toResponsesTools } from '../../src/llm/tools-format';
import type { ToolSpec } from '../../src/llm/types';

const specs: ToolSpec[] = [
	{
		name: 'search_notes',
		description: 'Search',
		parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
	},
];

describe('tool format conversion', () => {
	it('nests specs for Chat Completions', () => {
		expect(toChatCompletionsTools(specs)).toEqual([
			{
				type: 'function',
				function: {
					name: 'search_notes',
					description: 'Search',
					parameters: specs[0]?.parameters,
				},
			},
		]);
	});

	it('flattens specs for the Responses API', () => {
		expect(toResponsesTools(specs)).toEqual([
			{
				type: 'function',
				name: 'search_notes',
				description: 'Search',
				parameters: specs[0]?.parameters,
			},
		]);
	});
});
