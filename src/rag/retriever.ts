import { MAX_RETRIEVED_CHARS, MAX_SEARCH_HITS } from '../constants';
import type { VaultIndexer, SearchHit } from './indexer';

export function retrieveContext(
	indexer: VaultIndexer,
	query: string,
	maxChunks: number,
): SearchHit[] {
	const limit = Math.max(1, Math.min(maxChunks || MAX_SEARCH_HITS, 20));
	return indexer.search(query, limit);
}

export function formatHitsForPrompt(hits: SearchHit[]): string {
	if (hits.length === 0) {
		return '';
	}
	const parts: string[] = [];
	let used = 0;
	for (const hit of hits) {
		const block = `[[${hit.path}]] (${hit.headings || hit.title})\n${hit.snippet}`;
		if (used + block.length > MAX_RETRIEVED_CHARS) {
			break;
		}
		parts.push(block);
		used += block.length;
	}
	return parts.join('\n\n---\n\n');
}
