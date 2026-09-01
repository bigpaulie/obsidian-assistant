import { MAX_TOOL_RESULT_CHARS } from '../constants';
import type { ToolSpec } from '../llm/types';
import { asString, isRecord, truncate } from '../utils';
import { readNote, resolveMoveTarget } from '../vault/notes';
import { applyTextPatch } from '../vault/patch';
import { resolveMarkdownFile, sanitizeVaultPath } from '../vault/paths';
import type VaultAssistantPlugin from '../main';
import { formatHitsForPrompt } from '../rag/retriever';

export type NoteProposal =
	| { action: 'create' | 'update'; path: string; content: string }
	| { action: 'patch'; path: string; oldText: string; newText: string; replaceAll?: boolean }
	| { action: 'move'; path: string; destination: string };

export type ToolOutcome =
	| { type: 'text'; text: string; hitCount?: number }
	| { type: 'proposal'; proposal: NoteProposal; text: string };

/**
 * Canonical vault tools. Convert per provider before sending (see llm/tools-format).
 */
export function getToolDefinitions(includeSearch: boolean): ToolSpec[] {
	const tools: ToolSpec[] = [];
	if (includeSearch) {
		tools.push({
			name: 'search_notes',
			description:
				'Search the local vault index by keywords. Call this before answering any question about the user\'s notes or vault content.',
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
			name: 'get_current_datetime',
			description:
				'Get the user\'s current local date and time. Use when answering questions about today, deadlines, scheduling, or time-sensitive context.',
			parameters: {
				type: 'object',
				properties: {},
			},
		},
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
		{
			name: 'propose_patch_note',
			description:
				'Propose a surgical search/replace edit to an existing note. The user must click Apply in chat before anything is written. Use for small, targeted changes; use propose_update_note only when rewriting most or all of a note.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Existing vault path' },
					old_text: {
						type: 'string',
						description: 'Exact text to find in the note (whitespace-sensitive)',
					},
					new_text: { type: 'string', description: 'Replacement text (empty string deletes old_text)' },
					replace_all: {
						type: 'boolean',
						description: 'Replace all occurrences. Default false (requires a unique match).',
					},
				},
				required: ['path', 'old_text', 'new_text'],
			},
		},
		{
			name: 'propose_move_note',
			description:
				'Propose moving an existing markdown note to another folder, keeping the filename. The user must click Apply in chat before anything is written. Use an empty destination_folder for the vault root.',
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string', description: 'Existing vault path of the note to move' },
					destination_folder: {
						type: 'string',
						description: 'Destination folder inside the vault. Empty string means vault root.',
					},
				},
				required: ['path', 'destination_folder'],
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
		case 'get_current_datetime':
			return getCurrentDateTime();
		case 'read_note':
			return readNoteTool(plugin, rawArgs);
		case 'propose_create_note':
			return proposeNote(plugin, 'create', rawArgs);
		case 'propose_update_note':
			return proposeNote(plugin, 'update', rawArgs);
		case 'propose_patch_note':
			return proposePatch(plugin, rawArgs);
		case 'propose_move_note':
			return proposeMove(plugin, rawArgs);
		default:
			return { type: 'text', text: `Unknown tool: ${name}` };
	}
}

export function formatCurrentDateTime(now = new Date()): string {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const local = now.toLocaleString(undefined, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
		timeZoneName: 'short',
	});
	return [
		`Local: ${local}`,
		`Time zone: ${timeZone}`,
		`ISO 8601 (UTC): ${now.toISOString()}`,
	].join('\n');
}

function getCurrentDateTime(): ToolOutcome {
	return { type: 'text', text: formatCurrentDateTime() };
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
	const formatted = formatHitsForPrompt(hits);
	return {
		type: 'text',
		text: truncate(formatted, MAX_TOOL_RESULT_CHARS) || 'No matching notes.',
		hitCount: hits.length,
	};
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

/** Validate a patch proposal. Never writes disk. Verifies the patch applies to current content. */
export async function buildPatchProposal(
	plugin: VaultAssistantPlugin,
	path: string | undefined,
	oldText: string | undefined,
	newText: string | undefined,
	replaceAll = false,
): Promise<ProposalBuildResult> {
	if (!path || oldText === undefined || newText === undefined) {
		return { ok: false, error: 'patch requires path, old_text, and new_text.' };
	}
	const sanitized = sanitizeVaultPath(path);
	if (!sanitized) {
		return { ok: false, error: 'Invalid path. Use a relative vault path to a markdown note.' };
	}
	if (!resolveMarkdownFile(plugin.app, sanitized)) {
		return { ok: false, error: 'Note not found. Use propose_create_note for a new file.' };
	}
	let content: string;
	try {
		content = await readNote(plugin.app, sanitized);
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : 'Unable to read note.',
		};
	}
	const patched = applyTextPatch(content, oldText, newText, replaceAll);
	if (!patched.ok) {
		return patched;
	}
	return {
		ok: true,
		proposal: { action: 'patch', path: sanitized, oldText, newText, replaceAll },
	};
}

/** Validate a move proposal. Never writes disk. Empty destination folder means vault root. */
export function buildMoveProposal(
	plugin: VaultAssistantPlugin,
	path: string | undefined,
	destinationFolder: string | undefined,
): ProposalBuildResult {
	if (!path || destinationFolder === undefined) {
		return { ok: false, error: 'move requires path and destination_folder.' };
	}
	const result = resolveMoveTarget(plugin.app, path, destinationFolder);
	if (!result.ok) {
		return result;
	}
	return {
		ok: true,
		proposal: { action: 'move', path: result.file.path, destination: result.destination },
	};
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

async function proposePatch(plugin: VaultAssistantPlugin, rawArgs: unknown): Promise<ToolOutcome> {
	const replaceAll = field(rawArgs, 'replace_all') === true;
	const result = await buildPatchProposal(
		plugin,
		asString(field(rawArgs, 'path')),
		asString(field(rawArgs, 'old_text')),
		asString(field(rawArgs, 'new_text')),
		replaceAll,
	);
	if (!result.ok) {
		return { type: 'text', text: result.error };
	}
	return {
		type: 'proposal',
		proposal: result.proposal,
		text: `Proposal recorded for patch at ${result.proposal.path}. The user will review it in chat and must click Apply before the file is written. Do not claim the note was saved.`,
	};
}

function proposeMove(plugin: VaultAssistantPlugin, rawArgs: unknown): ToolOutcome {
	const result = buildMoveProposal(
		plugin,
		asString(field(rawArgs, 'path')),
		asString(field(rawArgs, 'destination_folder')),
	);
	if (!result.ok) {
		return { type: 'text', text: result.error };
	}
	if (result.proposal.action !== 'move') {
		return { type: 'text', text: 'Unable to record move proposal.' };
	}
	return {
		type: 'proposal',
		proposal: result.proposal,
		text: `Proposal recorded for move from ${result.proposal.path} to ${result.proposal.destination}. The user will review it in chat and must click Apply before the file is moved. Do not claim the note was moved.`,
	};
}

function field(rawArgs: unknown, key: string): unknown {
	return isRecord(rawArgs) ? rawArgs[key] : undefined;
}
