import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebugSession } from '../../src/debug-note';
import { LlmError } from '../../src/llm/errors';
import { DEFAULT_SETTINGS } from '../../src/settings';

const postJson = vi.fn();

vi.mock('../../src/llm/transport', () => ({
	postJson: (...args: unknown[]) => postJson(...args),
	getJson: vi.fn(),
}));

import { LlmClient } from '../../src/llm/client';

const API_KEY = 'sk-proj-testkey123';

describe('LlmClient debug capture', () => {
	beforeEach(() => {
		postJson.mockReset();
	});

	it('records the chat request and response without headers', async () => {
		postJson.mockResolvedValue({
			status: 200,
			json: {
				choices: [{ message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
			},
		});
		const settings = { ...DEFAULT_SETTINGS, openaiApiKey: API_KEY, debugMode: true };
		const session = new DebugSession(settings);
		const client = new LlmClient(settings, session);
		await client.chat({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: `note text ${API_KEY}` }],
		});

		const note = session.render({ rounds: 1 });
		expect(note).toContain('note text');
		expect(note).toContain('hello');
		expect(note).toContain('https://api.openai.com/v1/chat/completions');
		expect(note).toContain('api: completions');
		expect(note).not.toContain(API_KEY);
		expect(note).not.toContain('Authorization');
		const headers = postJson.mock.calls[0]?.[1] as Record<string, string>;
		expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
	});

	it('records a Responses API exchange', async () => {
		postJson.mockResolvedValue({
			status: 200,
			json: {
				output: [{ type: 'message', content: [{ text: 'from responses' }] }],
				status: 'completed',
			},
		});
		const settings = { ...DEFAULT_SETTINGS, openaiApiKey: API_KEY, debugMode: true };
		const session = new DebugSession(settings);
		const client = new LlmClient(settings, session);
		await client.chat({
			model: 'gpt-5.4',
			messages: [{ role: 'user', content: 'hello' }],
			tools: [
				{
					name: 'get_current_datetime',
					description: 'Current local time',
					parameters: { type: 'object', properties: {} },
				},
			],
		});

		const note = session.render({ rounds: 1 });
		expect(note).toContain('api: responses');
		expect(note).toContain('https://api.openai.com/v1/responses');
		expect(note).toContain('from responses');
		expect(note).not.toContain(API_KEY);
		expect(note).not.toContain('Authorization');
	});

	it('records a failed request and still throws', async () => {
		postJson.mockRejectedValue(new LlmError(`bad key ${API_KEY}`, 401));
		const settings = { ...DEFAULT_SETTINGS, openaiApiKey: API_KEY, debugMode: true };
		const session = new DebugSession(settings);
		const client = new LlmClient(settings, session);
		await expect(
			client.chat({
				model: 'gpt-4o-mini',
				messages: [{ role: 'user', content: 'hello' }],
			}),
		).rejects.toBeInstanceOf(LlmError);

		const note = session.render({ rounds: 1 });
		expect(note).toContain('### Error');
		expect(note).toContain('httpStatus: 401');
		expect(note).toContain('"model": "gpt-4o-mini"');
		expect(note).not.toContain(API_KEY);
	});

	it('does not record when no debug session is attached', async () => {
		postJson.mockResolvedValue({
			status: 200,
			json: {
				choices: [{ message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
			},
		});
		const client = new LlmClient({ ...DEFAULT_SETTINGS, openaiApiKey: API_KEY });
		await client.chat({
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: 'hello' }],
		});
		expect(postJson).toHaveBeenCalledTimes(1);
	});
});
