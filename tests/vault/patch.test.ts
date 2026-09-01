import { describe, expect, it } from 'vitest';
import { applyTextPatch } from '../../src/vault/patch';

describe('applyTextPatch', () => {
	it('rejects empty old_text', () => {
		expect(applyTextPatch('hello', '', 'x')).toEqual({
			ok: false,
			error: 'old_text must not be empty.',
		});
	});

	it('rejects when old_text is not found', () => {
		expect(applyTextPatch('hello world', 'missing', 'x')).toEqual({
			ok: false,
			error: 'Text to replace was not found in the note.',
		});
	});

	it('rejects ambiguous matches without replace_all', () => {
		expect(applyTextPatch('foo bar foo', 'foo', 'baz')).toEqual({
			ok: false,
			error:
				'Found 2 occurrences. Include more surrounding context in old_text, or set replace_all to true.',
		});
	});

	it('replaces a single match', () => {
		expect(applyTextPatch('hello world', 'world', 'there')).toEqual({
			ok: true,
			content: 'hello there',
			occurrences: 1,
		});
	});

	it('replaces all matches when replace_all is true', () => {
		expect(applyTextPatch('foo bar foo', 'foo', 'baz', true)).toEqual({
			ok: true,
			content: 'baz bar baz',
			occurrences: 2,
		});
	});

	it('allows deletion with empty new_text', () => {
		expect(applyTextPatch('remove me please', 'remove me ', '')).toEqual({
			ok: true,
			content: 'please',
			occurrences: 1,
		});
	});
});
