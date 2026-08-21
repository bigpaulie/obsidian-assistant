import { describe, expect, it, vi } from 'vitest';
import { MAX_RETRIEVED_CHARS, MAX_SEARCH_HITS } from '../../src/constants';
import type { SearchHit, VaultIndexer } from '../../src/rag/indexer';
import { formatHitsForPrompt, retrieveContext } from '../../src/rag/retriever';

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
	return {
		path: 'Note.md',
		title: 'Note',
		headings: 'Note',
		snippet: 'body',
		score: 1,
		...overrides,
	};
}

function indexerWith(hits: SearchHit[]): VaultIndexer {
	return {
		search: vi.fn((_query: string, _limit?: number) => hits),
	} as unknown as VaultIndexer;
}

describe('retrieveContext', () => {
	it('clamps the search limit to [1, 20] and treats 0 as the default', () => {
		const indexer = indexerWith([]);
		retrieveContext(indexer, 'q', 0);
		retrieveContext(indexer, 'q', -3);
		retrieveContext(indexer, 'q', 100);
		retrieveContext(indexer, 'q', 5);
		const search = indexer.search as ReturnType<typeof vi.fn>;
		expect(search.mock.calls.map((call) => call[1])).toEqual([MAX_SEARCH_HITS, 1, 20, 5]);
	});
});

describe('formatHitsForPrompt', () => {
	it('returns empty for no hits', () => {
		expect(formatHitsForPrompt([])).toBe('');
	});

	it('formats path, headings, and snippet', () => {
		expect(formatHitsForPrompt([hit({ path: 'A.md', headings: 'H1 / H2', snippet: 'hi' })])).toBe(
			'[[A.md]] (H1 / H2)\nhi',
		);
	});

	it('falls back to title when headings are empty', () => {
		expect(formatHitsForPrompt([hit({ headings: '', title: 'Title', snippet: 'x' })])).toBe(
			'[[Note.md]] (Title)\nx',
		);
	});

	it('stops before exceeding MAX_RETRIEVED_CHARS', () => {
		const huge = hit({ snippet: 's'.repeat(MAX_RETRIEVED_CHARS) });
		const small = hit({ path: 'small.md', snippet: 'ok' });
		expect(formatHitsForPrompt([huge, small])).toBe('');
		expect(formatHitsForPrompt([small, huge])).toBe('[[small.md]] (Note)\nok');
	});
});
