import type { CachedMetadata, HeadingCache, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { MAX_CHUNK_CHARS } from '../../src/constants';
import { chunkNote } from '../../src/rag/chunker';

function file(path: string, basename: string): TFile {
	return { path, basename } as TFile;
}

function heading(content: string, headingText: string, level: number): HeadingCache {
	const needle = `${'#'.repeat(level)} ${headingText}`;
	const offset = content.indexOf(needle);
	if (offset < 0) {
		throw new Error(`heading not found: ${needle}`);
	}
	return {
		heading: headingText,
		level,
		position: {
			start: { line: 0, col: 0, offset },
			end: { line: 0, col: needle.length, offset: offset + needle.length },
		},
	};
}

describe('chunkNote', () => {
	it('strips frontmatter and uses the title when there are no headings', () => {
		const content = '---\ntags: alpha, beta\n---\n\njust a note';
		const chunks = chunkNote(file('Inbox/A.md', 'A'), content, null);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({
			id: 'Inbox/A.md::0',
			path: 'Inbox/A.md',
			title: 'A',
			headings: 'A',
			body: 'just a note',
		});
	});

	it('leaves unclosed frontmatter in place', () => {
		const content = '---\ntags: nope\nstill going';
		const [chunk] = chunkNote(file('x.md', 'x'), content, null);
		expect(chunk?.body).toBe(content);
	});

	it('merges inline and frontmatter tags from string or array values', () => {
		const content = 'body';
		const stringTags = chunkNote(file('n.md', 'n'), content, {
			tags: [{ tag: '#inline', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 7, offset: 7 } } }],
			frontmatter: { tags: 'alpha, #beta gamma' },
		} as CachedMetadata);
		expect(stringTags[0]?.tags.split(' ').sort()).toEqual(['alpha', 'beta', 'gamma', 'inline']);

		const arrayTags = chunkNote(file('n.md', 'n'), content, {
			frontmatter: { tags: ['one', '#two', 3, ''] },
		} as CachedMetadata);
		expect(arrayTags[0]?.tags.split(' ').sort()).toEqual(['one', 'two']);
	});

	it('keeps a preface and nested heading trails', () => {
		const content = ['Intro paragraph.', '', '# Alpha', '', 'alpha body', '', '## Beta', '', 'beta body'].join('\n');
		const cache = {
			headings: [heading(content, 'Alpha', 1), heading(content, 'Beta', 2)],
		} as CachedMetadata;
		const chunks = chunkNote(file('Note.md', 'Note'), content, cache);
		expect(chunks.map((chunk) => chunk.headings)).toEqual(['Note', 'Alpha', 'Alpha / Beta']);
		expect(chunks[0]?.body).toBe('Intro paragraph.');
		expect(chunks[1]?.body).toContain('alpha body');
		expect(chunks[2]?.body).toContain('beta body');
	});

	it('splits oversized sections and hard-wraps huge paragraphs', () => {
		const hugePara = 'x'.repeat(MAX_CHUNK_CHARS + 50);
		const content = `${'a'.repeat(200)}\n\n${'b'.repeat(200)}\n\n${hugePara}`;
		const chunks = chunkNote(file('big.md', 'big'), content, null);
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.every((chunk) => chunk.body.length <= MAX_CHUNK_CHARS)).toBe(true);
		expect(chunks.some((chunk) => chunk.body.includes('x'.repeat(40)))).toBe(true);
	});

	it('emits a fallback chunk when the note has no usable body', () => {
		const chunks = chunkNote(file('empty.md', 'empty'), '   \n\n', null);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({
			id: 'empty.md::0',
			headings: 'empty',
			body: '',
		});
	});
});
