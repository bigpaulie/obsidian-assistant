import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { DEBUG_NOTES_FOLDER } from '../src/constants';
import { DebugSession } from '../src/debug-note';
import { DEFAULT_SETTINGS } from '../src/settings';

const OPENAI_KEY = 'sk-proj-testkey123';
const OPENROUTER_KEY = 'or-local-key-99';
const OLLAMA_KEY = 'ollama-plain-key';

function session(): DebugSession {
	return new DebugSession({
		...DEFAULT_SETTINGS,
		openaiApiKey: OPENAI_KEY,
		openrouterApiKey: OPENROUTER_KEY,
		ollamaApiKey: OLLAMA_KEY,
	});
}

function vaultApp(create: (path: string, content: string) => Promise<{ path: string }>): App {
	return {
		vault: {
			getAbstractFileByPath: () => null,
			getFolderByPath: () => ({}),
			create,
		},
	} as unknown as App;
}

describe('DebugSession', () => {
	it('writes request, response, and tool parameters with secrets removed', () => {
		const debug = session();
		debug.recordExchange({
			api: 'completions',
			endpoint: 'https://api.openai.com/v1/chat/completions',
			httpStatus: 200,
			request: {
				model: 'gpt-4o-mini',
				authorization: `Bearer ${OPENAI_KEY}`,
				apiKey: OLLAMA_KEY,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: `see ${OPENROUTER_KEY} and Bearer sk-live-secret` },
							{ type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAA' } },
						],
					},
				],
			},
			response: {
				choices: [{ message: { content: `answer with ${OLLAMA_KEY}` } }],
			},
		});
		debug.recordTool('read_note', {
			path: 'Notes/A.md',
			password: OLLAMA_KEY,
			access_token: OPENAI_KEY,
		});
		debug.recordExchange({
			api: 'responses',
			endpoint: 'https://api.openai.com/v1/responses',
			httpStatus: 401,
			request: { model: 'gpt-4o-mini', input: 'hello' },
			error: `Provider said ${OPENAI_KEY}`,
		});

		const note = debug.render({ rounds: 2, tools: 'read_note' });
		const request1 = note.indexOf('## Request 1');
		const tool = note.indexOf('## Tool call 1');
		const request2 = note.indexOf('## Request 2');

		expect(note).toContain('gpt-4o-mini');
		expect(note).toContain('see ');
		expect(note).toContain('answer with [redacted]');
		expect(note).toContain('[image data redacted]');
		expect(note).toContain('name: read_note');
		expect(note).toContain('Notes/A.md');
		expect(note).toContain('api: responses');
		expect(note).toContain('httpStatus: 401');
		expect(note).toContain('### Error');
		expect(note).toContain('rounds: 2');
		expect(request1).toBeGreaterThan(-1);
		expect(tool).toBeGreaterThan(request1);
		expect(request2).toBeGreaterThan(tool);
		expect(note).not.toContain(OPENAI_KEY);
		expect(note).not.toContain(OPENROUTER_KEY);
		expect(note).not.toContain(OLLAMA_KEY);
		expect(note).not.toContain('sk-live-secret');
		expect(note).not.toContain('data:image/png;base64');
		expect(note).not.toContain('Bearer sk-');
	});

	it('keeps invalid tool arguments as text', () => {
		const debug = session();
		debug.recordTool('search_notes', '{not-json');
		const note = debug.render({ rounds: 1 });
		expect(note).toContain('search_notes');
		expect(note).toContain('{not-json');
	});

	it('writes one note under the debug folder', async () => {
		const debug = session();
		debug.recordExchange({
			api: 'completions',
			endpoint: 'https://api.openai.com/v1/chat/completions',
			request: { model: 'gpt-4o-mini' },
			response: { ok: true },
		});
		const created: { path?: string; content?: string } = {};
		await debug.write(
			vaultApp(async (path, content) => {
				created.path = path;
				created.content = content;
				return { path };
			}),
			{ rounds: 1 },
		);
		expect(created.path).toMatch(new RegExp(`^${DEBUG_NOTES_FOLDER}/\\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2}-\\d{2}\\.md$`));
		expect(debug.notePath).toBe(created.path);
		expect(created.content).toContain('"model": "gpt-4o-mini"');
		expect(created.content).not.toContain(OPENAI_KEY);
	});

	it('records a write failure without throwing', async () => {
		const debug = session();
		await debug.write(
			vaultApp(async () => {
				throw new Error(`disk full ${OPENAI_KEY}`);
			}),
			{ rounds: 1 },
		);
		expect(debug.notePath).toBeUndefined();
		expect(debug.noteError).toBeTruthy();
		expect(debug.noteError).not.toContain(OPENAI_KEY);
	});

	it('does not write twice', async () => {
		const debug = session();
		const create = vi.fn(async (path: string) => ({ path }));
		const app = vaultApp(create);
		await debug.write(app, { rounds: 1 });
		await debug.write(app, { rounds: 1 });
		expect(create).toHaveBeenCalledTimes(1);
	});
});
