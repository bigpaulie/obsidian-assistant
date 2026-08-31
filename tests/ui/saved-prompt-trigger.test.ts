import { describe, expect, it } from 'vitest';
import {
	isSavedPromptTriggerBoundary,
	savedPromptSpaceTrigger,
	savedPromptTriggerSegment,
} from '../../src/ui/saved-prompt-trigger';

describe('isSavedPromptTriggerBoundary', () => {
	it('allows trigger at line start', () => {
		expect(isSavedPromptTriggerBoundary('@foo', 0)).toBe(true);
	});

	it('allows trigger after whitespace', () => {
		expect(isSavedPromptTriggerBoundary('hello @foo', 6)).toBe(true);
		expect(isSavedPromptTriggerBoundary('hello\n@foo', 6)).toBe(true);
	});

	it('rejects trigger mid-word', () => {
		expect(isSavedPromptTriggerBoundary('foo@bar', 3)).toBe(false);
	});
});

describe('savedPromptTriggerSegment', () => {
	it('returns lone @ as picker segment', () => {
		expect(savedPromptTriggerSegment('@', 1)).toEqual({ lineStart: 0, segment: '@' });
	});

	it('returns @name as expand segment', () => {
		expect(savedPromptTriggerSegment('@MyPrompt', 9)).toEqual({
			lineStart: 0,
			segment: '@MyPrompt',
		});
	});

	it('ignores mid-word @', () => {
		expect(savedPromptTriggerSegment('foo@bar', 7)).toBeNull();
	});

	it('uses only the current line in multiline input', () => {
		expect(savedPromptTriggerSegment('line one\n@name', 14)).toEqual({
			lineStart: 9,
			segment: '@name',
		});
	});

	it('returns null when cursor is before @', () => {
		expect(savedPromptTriggerSegment('@name', 0)).toBeNull();
	});
});

describe('savedPromptSpaceTrigger', () => {
	it('detects @ followed by space as picker', () => {
		expect(savedPromptSpaceTrigger('@ ', 2)).toEqual({
			lineStart: 0,
			segment: '@',
			kind: 'picker',
		});
	});

	it('detects @name followed by space as expand', () => {
		expect(savedPromptSpaceTrigger('@MyPrompt ', 10)).toEqual({
			lineStart: 0,
			segment: '@MyPrompt',
			kind: 'expand',
		});
	});

	it('returns null without trailing space', () => {
		expect(savedPromptSpaceTrigger('@foo', 4)).toBeNull();
		expect(savedPromptSpaceTrigger('@', 1)).toBeNull();
	});

	it('ignores mid-word @ before space', () => {
		expect(savedPromptSpaceTrigger('foo@bar ', 8)).toBeNull();
	});

	it('works on the current line in multiline input', () => {
		expect(savedPromptSpaceTrigger('first\n@ ', 8)).toEqual({
			lineStart: 6,
			segment: '@',
			kind: 'picker',
		});
	});
});
