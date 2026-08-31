import type { SearchHit } from '../rag/indexer';
import { formatHitsForPrompt } from '../rag/retriever';
import { formatReferencedNotes, type ReferencedNote } from '../vault/references';

export const BUILTIN_SYSTEM_PROMPT = [
	'You are Vault Assistant, an AI helper inside Obsidian.',
	'Search and read notes before answering questions about the vault.',
	'Cite sources as [[wikilinks]] using note paths.',
	'To create, update, or move notes, use the provided tools.',
	'Call get_current_datetime when you need the current date or time.',
	'Never claim you already wrote or moved a file; the user must click Apply.',
	'Stay inside the vault. Do not invent paths outside the user\'s notes.',
	'Prefer concise, useful answers in markdown.',
].join(' ');

export function buildSystemPrompt(options: {
	userPrompt: string;
	/** When set, userPrompt came from this vault system note and must take priority. */
	systemNotePath?: string | null;
	activeNotePath: string | null;
	ragHits: SearchHit[];
	referencedNotes: ReferencedNote[];
}): string {
	const parts = [BUILTIN_SYSTEM_PROMPT];
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
	// Extra instructions last so they win over long vault context (language, tone, style).
	const extra = options.userPrompt.trim();
	if (extra) {
		if (options.systemNotePath) {
			parts.push(
				[
					`Follow the vault system note [[${options.systemNotePath}]] with highest priority.`,
					'These instructions override the settings extra prompt and take precedence for language, tone, and style over retrieved or referenced note content.',
					extra,
				].join('\n'),
			);
		} else {
			parts.push(extra);
		}
	}
	return parts.join('\n\n');
}
