import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEBUG_NOTES_FOLDER } from '../../src/constants';
import { LlmError } from '../../src/llm/errors';
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

	it('does not write a debug note when debug mode is off', async () => {
		chatMock.mockResolvedValueOnce({
			message: { role: 'assistant', content: 'Done.' },
			durationMs: 10,
		});
		const create = vi.fn();
		const plugin = pluginStub();
		Object.assign(plugin.app.vault, {
			getAbstractFileByPath: () => null,
			getFolderByPath: () => ({}),
			create,
		});

		await runAgent(plugin as never, {
			history: [],
			userMessage: 'Hello',
			cancelled: () => false,
		});

		expect(create).not.toHaveBeenCalled();
	});

	it('writes a debug note with tool parameters and strips secrets', async () => {
		const key = 'super-secret-key';
		chatMock
			.mockResolvedValueOnce({
				message: {
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: 'call_1',
							type: 'function',
							function: {
								name: 'search_notes',
								arguments: JSON.stringify({
									query: 'vault',
									api_key: key,
									note: `prefix ${key} Bearer sk-live-abcdef data:image/png;base64,aaaaBBBB`,
								}),
							},
						},
					],
				},
				durationMs: 10,
			})
			.mockResolvedValueOnce({
				message: { role: 'assistant', content: 'Found it.' },
				durationMs: 10,
			});

		const created: { path?: string; content?: string } = {};
		const create = vi.fn(async (path: string, content: string) => {
			created.path = path;
			created.content = content;
			return { path };
		});
		const plugin = pluginStub({ ...DEFAULT_SETTINGS, debugMode: true, openaiApiKey: key });
		Object.assign(plugin.app.vault, {
			getAbstractFileByPath: () => null,
			getFolderByPath: () => ({}),
			create,
		});

		const result = await runAgent(plugin as never, {
			history: [],
			userMessage: 'What is in my vault?',
			cancelled: () => false,
		});

		expect(created.path).toMatch(
			new RegExp(`^${DEBUG_NOTES_FOLDER}/\\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2}-\\d{2}\\.md$`),
		);
		expect(result.debug.debugNote).toBe(created.path);
		expect(created.content).toContain('name: search_notes');
		expect(created.content).toContain('vault');
		expect(created.content).toContain('[image data redacted]');
		expect(created.content).not.toContain(key);
		expect(created.content).not.toContain('sk-live-abcdef');
		expect(created.content).not.toContain('data:image');
		expect(result.assistantText).toBe('Found it.');
	});

	it('saves raw tool arguments when they are not JSON', async () => {
		chatMock
			.mockResolvedValueOnce({
				message: {
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: 'call_1',
							type: 'function',
							function: { name: 'search_notes', arguments: '{not-json' },
						},
					],
				},
				durationMs: 10,
			})
			.mockResolvedValueOnce({
				message: { role: 'assistant', content: 'Done.' },
				durationMs: 10,
			});

		const created: { content?: string } = {};
		const plugin = pluginStub({ ...DEFAULT_SETTINGS, debugMode: true });
		Object.assign(plugin.app.vault, {
			getAbstractFileByPath: () => null,
			getFolderByPath: () => ({}),
			create: vi.fn(async (path: string, content: string) => {
				created.content = content;
				return { path };
			}),
		});

		const result = await runAgent(plugin as never, {
			history: [],
			userMessage: 'Search',
			cancelled: () => false,
		});

		expect(created.content).toContain('{not-json');
		expect(result.assistantText).toBe('Done.');
		expect(plugin.indexer.search).not.toHaveBeenCalled();
	});

	it('attaches the debug note path when the model request fails', async () => {
		chatMock.mockRejectedValueOnce(new LlmError('nope', 500, { httpStatus: 500 }));
		const create = vi.fn(async (path: string) => ({ path }));
		const plugin = pluginStub({ ...DEFAULT_SETTINGS, debugMode: true });
		Object.assign(plugin.app.vault, {
			getAbstractFileByPath: () => null,
			getFolderByPath: () => ({}),
			create,
		});

		await expect(
			runAgent(plugin as never, {
				history: [],
				userMessage: 'Hello',
				cancelled: () => false,
			}),
		).rejects.toMatchObject({
			debug: { debugNote: expect.stringContaining(`${DEBUG_NOTES_FOLDER}/`) },
		});
		expect(create).toHaveBeenCalledTimes(1);
	});
});
