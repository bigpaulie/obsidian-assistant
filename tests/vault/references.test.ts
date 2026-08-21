import { describe, expect, it } from 'vitest';
import { formatReferencedNotes, parseWikilinkTargets } from '../../src/vault/references';

describe('parseWikilinkTargets', () => {
	it('extracts targets and ignores aliases and headings', () => {
		const text = 'See [[Note]] and [[Folder/Other|alias]] plus [[Heading#Section]] and [[]]';
		expect(parseWikilinkTargets(text)).toEqual(['Note', 'Folder/Other', 'Heading']);
	});

	it('returns an empty list when there are no wikilinks', () => {
		expect(parseWikilinkTargets('plain text [link](url)')).toEqual([]);
	});
});

describe('formatReferencedNotes', () => {
	it('returns empty for no notes', () => {
		expect(formatReferencedNotes([])).toBe('');
	});

	it('joins notes with a separator', () => {
		expect(
			formatReferencedNotes([
				{ path: 'A.md', content: 'one' },
				{ path: 'B.md', content: 'two' },
			]),
		).toBe('[[A.md]]\none\n\n---\n\n[[B.md]]\ntwo');
	});
});
