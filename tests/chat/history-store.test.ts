import { describe, expect, it } from 'vitest';
import {
	capConversations,
	emptyHistoryFile,
	parseHistoryFile,
	upsertConversation,
	type StoredConversation,
} from '../../src/chat/history-store';
import { MAX_STORED_CONVERSATIONS } from '../../src/constants';

function sample(id: string, updatedAt: number, title = 'T'): StoredConversation {
	return {
		id,
		title,
		createdAt: updatedAt - 1000,
		updatedAt,
		messages: [{ role: 'user', content: 'hi' }],
		referencedPaths: [],
	};
}

describe('chat history store', () => {
	it('starts empty at version 1', () => {
		expect(emptyHistoryFile()).toEqual({ version: 1, conversations: [] });
	});

	it('parses a valid history file', () => {
		const raw = JSON.stringify({
			version: 1,
			conversations: [
				{
					id: 'a',
					title: 'Hello',
					createdAt: 1,
					updatedAt: 2,
					messages: [
						{ role: 'user', content: 'hi' },
						{ role: 'assistant', content: 'hello' },
					],
					referencedPaths: ['Note.md'],
				},
			],
		});
		const parsed = parseHistoryFile(raw);
		expect(parsed?.conversations).toHaveLength(1);
		expect(parsed?.conversations[0]?.title).toBe('Hello');
		expect(parsed?.conversations[0]?.referencedPaths).toEqual(['Note.md']);
	});

	it('rejects wrong version and malformed JSON', () => {
		expect(parseHistoryFile('{"version":2,"conversations":[]}')).toBeNull();
		expect(parseHistoryFile('not-json')).toBeNull();
		expect(parseHistoryFile('{"version":1}')).toBeNull();
	});

	it('skips invalid conversations while keeping valid ones', () => {
		const raw = JSON.stringify({
			version: 1,
			conversations: [
				{ id: 'bad' },
				sample('good', 10),
				{ role: 'user', content: 'nope' },
			],
		});
		const parsed = parseHistoryFile(raw);
		expect(parsed?.conversations.map((c) => c.id)).toEqual(['good']);
	});

	it('upserts by id and sorts by updatedAt', () => {
		let file = emptyHistoryFile();
		file = upsertConversation(file, sample('a', 1));
		file = upsertConversation(file, sample('b', 3));
		file = upsertConversation(file, sample('a', 5, 'Updated'));
		expect(file.conversations.map((c) => c.id)).toEqual(['a', 'b']);
		expect(file.conversations[0]?.title).toBe('Updated');
	});

	it('caps to the newest conversations', () => {
		const many = Array.from({ length: MAX_STORED_CONVERSATIONS + 5 }, (_, i) =>
			sample(`id-${i}`, i + 1),
		);
		const capped = capConversations(many);
		expect(capped).toHaveLength(MAX_STORED_CONVERSATIONS);
		expect(capped[0]?.id).toBe(`id-${MAX_STORED_CONVERSATIONS + 4}`);
		expect(capped.at(-1)?.id).toBe('id-5');
	});
});
