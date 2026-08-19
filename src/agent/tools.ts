import { MAX_TOOL_RESULT_CHARS } from '../constants';
import type { ToolSpec } from '../llm/types';
import { asString, isRecord, truncate } from '../utils';
import { readNote } from '../vault/notes';
import { resolveMarkdownFile, sanitizeVaultPath } from '../vault/paths';
import type VaultAssistantPlugin from '../main';

export interface NoteProposal {
	action: 'create' | 'update';
	path: string;
	content: string;
}

export type ToolOutcome =
	| { type: 'text'; text: string }
	| { type: 'proposal'; proposal: NoteProposal; text: string };

/**
 * Canonical vault tools. Convert per provider before sending (see llm/tools-format).
 */
export function getToolDefinitions(includeSearch: boolean): ToolSpec[] {
	const tools: ToolSpec[] = [];
	if (includeSearch) {
		tools.push({
			name: 'search_notes',
			description: 'Search the local vault index by keywords. Use this before answering questions about notes.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Search query' },
				},
				required: ['query'],
			},
		});
	}
	tools.push(
		{
			name: 'read_note',
			description: 'Read a markdown note by vault path (for example Folder/Note.md).',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Path inside the vault' },
				},
				required: ['path'],
			},
		},
		{
			name: 'propose_create_note',
			description:
				'Propose creating a new markdown note. The user must click Apply in chat before anything is written.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Desired vault path, including .md' },
					content: { type: 'string', description: 'Full markdown content' },
				},
				required: ['path', 'content'],
			},
		},
		{
			name: 'propose_update_note',
			description:
				'Propose replacing the full contents of an existing note. The user must click Apply in chat before anything is written.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Existing vault path' },
					content: { type: 'string', description: 'Full replacement markdown' },
				},
				required: ['path', 'content'],
			},
		},
	);
	return tools;
}

/** Run a model tool. Write tools only return a proposal; they never touch disk. */
export async function executeTool(
	plugin: VaultAssistantPlugin,
	name: string,
	rawArgs: unknown,
): Promise<ToolOutcome> {
	switch (name) {
		case 'search_notes':
			return searchNotes(plugin, rawArgs);
		case 'read_note':
			return readNoteTool(plugin, rawArgs);
		case 'propose_create_note':
			return proposeNote(plugin, 'create', rawArgs);
		case 'propose_update_note':
			return proposeNote(plugin, 'update', rawArgs);
		default:
			return { type: 'text', text: `Unknown tool: ${name}` };
	}
}

function searchNotes(plugin: VaultAssistantPlugin, rawArgs: unknown): ToolOutcome {
	const query = asString(field(rawArgs, 'query'))?.trim();
	if (!query) {
		return { type: 'text', text: 'search_notes requires a query string.' };
	}
	const hits = plugin.indexer.search(query, plugin.settings.maxChunks);
	if (hits.length === 0) {
		return { type: 'text', text: 'No matching notes.' };
	}
	const lines = hits.map(
		(hit) =>
			`- [[${hit.path}]] score=${hit.score.toFixed(2)} ${hit.headings ? `(${hit.headings})` : ''}\n  ${hit.snippet.replace(/\n/g, ' ')}`,
	);
	return { type: 'text', text: truncate(lines.join('\n'), MAX_TOOL_RESULT_CHARS) };
}

async function readNoteTool(plugin: VaultAssistantPlugin, rawArgs: unknown): Promise<ToolOutcome> {
	const path = asString(field(rawArgs, 'path'));
	if (!path) {
		return { type: 'text', text: 'read_note requires a path.' };
	}
	try {
		const content = await readNote(plugin.app, path);
		const file = resolveMarkdownFile(plugin.app, path);
		const header = file ? `Path: ${file.path}\n\n` : '';
		return { type: 'text', text: truncate(header + content, MAX_TOOL_RESULT_CHARS) };
	} catch (error) {
		return { type: 'text', text: error instanceof Error ? error.message : 'Unable to read note.' };
	}
}

export type ProposalBuildResult =
	| { ok: true; proposal: NoteProposal }
	| { ok: false; error: string };

/** Validate a create/update proposal. Never writes disk. */
export function buildNoteProposal(
	plugin: VaultAssistantPlugin,
	action: 'create' | 'update',
	path: string | undefined,
	content: string | undefined,
): ProposalBuildResult {
	if (!path || content === undefined) {
		return { ok: false, error: `${action} requires path and content.` };
	}
	const sanitized = sanitizeVaultPath(path);
	if (!sanitized) {
		return { ok: false, error: 'Invalid path. Use a relative vault path to a markdown note.' };
	}
	if (action === 'update' && !resolveMarkdownFile(plugin.app, sanitized)) {
		return { ok: false, error: 'Note not found. Use propose_create_note for a new file.' };
	}
	return { ok: true, proposal: { action, path: sanitized, content } };
}

function proposeNote(
	plugin: VaultAssistantPlugin,
	action: 'create' | 'update',
	rawArgs: unknown,
): ToolOutcome {
	const result = buildNoteProposal(
		plugin,
		action,
		asString(field(rawArgs, 'path')),
		asString(field(rawArgs, 'content')),
	);
	if (!result.ok) {
		return { type: 'text', text: result.error };
	}
	return {
		type: 'proposal',
		proposal: result.proposal,
		text: `Proposal recorded for ${action} at ${result.proposal.path}. The user will review it in chat and must click Apply before the file is written. Do not claim the note was saved.`,
	};
}

function field(rawArgs: unknown, key: string): unknown {
	return isRecord(rawArgs) ? rawArgs[key] : undefined;
}
