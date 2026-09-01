import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings';

const chatMock = vi.fn();

vi.mock('../../src/llm/client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../src/llm/client')>();
	return {
		...actual,
		LlmClient: vi.fn(function LlmClientMock() {
			return { chat: chatMock };
		}),
	};
});

import { runAgent } from '../../src/agent/loop';

function pluginStub(settings = DEFAULT_SETTINGS) {
	return {
		settings,
		indexer: {
			search: vi.fn(() => [
				{ path: 'Note.md', title: 'Note', headings: 'H1', snippet: 'content', score: 1.5 },
			]),
		},
		app: {
			vault: {
				getFileByPath: () => null,
				cachedRead: vi.fn(async () => ''),
			},
			metadataCache: {
				getFirstLinkpathDest: () => null,
			},
			workspace: {
				getActiveFile: () => null,
			},
		},
	};
}

const datetimeToolRound = {
	message: {
		role: 'assistant' as const,
		content: '',
		tool_calls: [
			{
				id: 'call_1',
				type: 'function' as const,
				function: { name: 'get_current_datetime', arguments: '{}' },
			},
		],
	},
	durationMs: 10,
};

describe('runAgent', () => {
	beforeEach(() => {
		chatMock.mockReset();
	});

	it('does not stuff retrieved context into the system prompt', async () => {
		chatMock.mockResolvedValueOnce({
			message: { role: 'assistant', content: 'Done.' },
			durationMs: 10,
		});

		const plugin = pluginStub();
		await runAgent(plugin as never, {
			history: [],
			userMessage: 'What is in my vault?',
			cancelled: () => false,
		});

		const firstCall = chatMock.mock.calls[0]?.[0];
		expect(firstCall?.messages[0]?.content).not.toContain('Retrieved vault context');
	});

	it('tracks ragHits when search_notes returns results', async () => {
		chatMock
			.mockResolvedValueOnce({
				message: {
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: 'call_1',
							type: 'function',
							function: { name: 'search_notes', arguments: '{"query":"vault"}' },
						},
					],
				},
				durationMs: 10,
			})
			.mockResolvedValueOnce({
				message: { role: 'assistant', content: 'Found it.' },
				durationMs: 10,
			});

		const plugin = pluginStub();
		const result = await runAgent(plugin as never, {
			history: [],
			userMessage: 'What is in my vault?',
			cancelled: () => false,
		});

		expect(plugin.indexer.search).toHaveBeenCalledWith('vault', DEFAULT_SETTINGS.maxChunks);
		expect(result.debug.ragHits).toBe(1);
		expect(result.assistantText).toBe('Found it.');
	});

	it('respects maxToolRounds setting', async () => {
		let toolRounds = 0;
		chatMock.mockImplementation(async (request) => {
			if (request.tools?.length) {
				toolRounds += 1;
				return datetimeToolRound;
			}
			return {
				message: { role: 'assistant', content: 'Final answer.' },
				durationMs: 10,
			};
		});

		const plugin = pluginStub({ ...DEFAULT_SETTINGS, maxToolRounds: 2 });
		const result = await runAgent(plugin as never, {
			history: [],
			userMessage: 'What time is it?',
			cancelled: () => false,
		});

		expect(toolRounds).toBe(2);
		expect(chatMock).toHaveBeenCalledTimes(3);
		expect(result.debug.rounds).toBe(2);
		expect(result.assistantText).toBe('Final answer.');
	});
});
