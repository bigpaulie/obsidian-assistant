import { describe, expect, it } from 'vitest';
import {
	capPrompts,
	emptySavedPromptsFile,
	findPromptByName,
	parseSavedPromptsFile,
	removePrompt,
	upsertPrompt,
	type SavedPrompt,
} from '../../src/prompts/saved-prompt-store';
import { MAX_SAVED_PROMPTS } from '../../src/constants';

function sample(id: string, name: string, updatedAt: number, content = 'Do the thing'): SavedPrompt {
	return { id, name, content, updatedAt };
}

describe('saved prompt store', () => {
	it('starts empty at version 1', () => {
		expect(emptySavedPromptsFile()).toEqual({ version: 1, prompts: [] });
	});

	it('parses a valid saved-prompts file', () => {
		const raw = JSON.stringify({
			version: 1,
			prompts: [
				{
					id: 'a',
					name: 'Summarize',
					content: 'Summarize in bullets.',
					updatedAt: 2,
				},
			],
		});
		const parsed = parseSavedPromptsFile(raw);
		expect(parsed?.prompts).toHaveLength(1);
		expect(parsed?.prompts[0]?.name).toBe('Summarize');
	});

	it('rejects wrong version and malformed JSON', () => {
		expect(parseSavedPromptsFile('{"version":2,"prompts":[]}')).toBeNull();
		expect(parseSavedPromptsFile('not-json')).toBeNull();
		expect(parseSavedPromptsFile('{"version":1}')).toBeNull();
	});

	it('skips invalid prompts while keeping valid ones', () => {
		const raw = JSON.stringify({
			version: 1,
			prompts: [{ id: 'bad' }, sample('good', 'OK', 10), { name: 'nope' }],
		});
		const parsed = parseSavedPromptsFile(raw);
		expect(parsed?.prompts.map((p) => p.id)).toEqual(['good']);
	});

	it('upserts by id and sorts by updatedAt', () => {
		let file = emptySavedPromptsFile();
		file = upsertPrompt(file, sample('a', 'First', 1));
		file = upsertPrompt(file, sample('b', 'Second', 3));
		file = upsertPrompt(file, sample('a', 'First updated', 5));
		expect(file.prompts.map((p) => p.id)).toEqual(['a', 'b']);
		expect(file.prompts[0]?.name).toBe('First updated');
	});

	it('removes a prompt by id', () => {
		let file = emptySavedPromptsFile();
		file = upsertPrompt(file, sample('a', 'Keep', 1));
		file = upsertPrompt(file, sample('b', 'Remove', 2));
		file = removePrompt(file, 'b');
		expect(file.prompts.map((p) => p.id)).toEqual(['a']);
	});

	it('caps to the newest prompts', () => {
		const many = Array.from({ length: MAX_SAVED_PROMPTS + 5 }, (_, i) =>
			sample(`id-${i}`, `Name ${i}`, i + 1),
		);
		const capped = capPrompts(many);
		expect(capped).toHaveLength(MAX_SAVED_PROMPTS);
		expect(capped[0]?.id).toBe(`id-${MAX_SAVED_PROMPTS + 4}`);
	});

	it('finds prompts by name case-insensitively', () => {
		const prompts = [sample('a', 'Summarize', 1), sample('b', 'Expand', 2)];
		expect(findPromptByName(prompts, 'summarize')?.id).toBe('a');
		expect(findPromptByName(prompts, ' EXPAND ')?.id).toBe('b');
		expect(findPromptByName(prompts, 'missing')).toBeNull();
	});
});
