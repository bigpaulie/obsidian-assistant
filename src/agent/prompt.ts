import { formatReferencedNotes, type ReferencedNote } from '../vault/references';

export const BUILTIN_SYSTEM_PROMPT = [
	'You are Vault Assistant, an AI helper inside Obsidian.',
	'When the user asks about vault content, call search_notes before answering.',
	'Use read_note when you need the full text of a specific note.',
	'Cite sources as [[wikilinks]] using note paths.',
	'To create, update, or move notes, use the provided tools.',
	'For note edits: use propose_patch_note only for one localized change, or one replace_all swap of a single phrase (at most two patch calls per note).',
	'Use propose_update_note for three or more edits, restructuring, reformatting, or when you already have the full note from read_note. Do not chain many patch calls when one update is enough.',
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
	referencedNotes: ReferencedNote[];
}): string {
	const parts = [BUILTIN_SYSTEM_PROMPT];
	if (options.activeNotePath) {
		parts.push(`The user is currently viewing [[${options.activeNotePath}]].`);
	}
	const referenced = formatReferencedNotes(options.referencedNotes);
	if (referenced) {
		parts.push(
			'The user explicitly referenced these notes. Prefer them over search results.\n' + referenced,
		);
	}
	// Extra instructions last so they win over referenced note content (language, tone, style).
	const extra = options.userPrompt.trim();
	if (extra) {
		if (options.systemNotePath) {
			parts.push(
				[
					`Follow the vault system note [[${options.systemNotePath}]] with highest priority.`,
					'These instructions override the settings extra prompt and take precedence for language, tone, and style over referenced note content.',
					extra,
				].join('\n'),
			);
		} else {
			parts.push(extra);
		}
	}
	return parts.join('\n\n');
}
