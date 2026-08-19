import type { SearchHit } from '../rag/indexer';
import { formatHitsForPrompt } from '../rag/retriever';
import { formatReferencedNotes, type ReferencedNote } from '../vault/references';

export const BUILTIN_SYSTEM_PROMPT = [
	'You are Vault Assistant, an AI helper inside Obsidian.',
	'Search and read notes before answering questions about the vault.',
	'Cite sources as [[wikilinks]] using note paths.',
	'To create or update notes, use the provided tools.',
	'Never claim you already wrote a file; the user must click Apply.',
	'Stay inside the vault. Do not invent paths outside the user\'s notes.',
	'Prefer concise, useful answers in markdown.',
].join(' ');

export function buildSystemPrompt(options: {
	userPrompt: string;
	activeNotePath: string | null;
	ragHits: SearchHit[];
	referencedNotes: ReferencedNote[];
}): string {
	const parts = [BUILTIN_SYSTEM_PROMPT];
	const extra = options.userPrompt.trim();
	if (extra) {
		parts.push(extra);
	}
	if (options.activeNotePath) {
		parts.push(`The user is currently viewing [[${options.activeNotePath}]].`);
	}
	const referenced = formatReferencedNotes(options.referencedNotes);
	if (referenced) {
		parts.push(
			'The user explicitly referenced these notes. Prefer them over retrieved chunks.\n' + referenced,
		);
	}
	const rag = formatHitsForPrompt(options.ragHits);
	if (rag) {
		parts.push(`Retrieved vault context:\n${rag}`);
	}
	return parts.join('\n\n');
}
