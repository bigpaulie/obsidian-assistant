import { describe, expect, it, vi } from 'vitest';
import { buildMoveProposal, buildNoteProposal, executeTool, getToolDefinitions } from '../../src/agent/tools';

function pluginStub(files: Record<string, { path: string; extension: string }> = {}) {
	const create = vi.fn();
	const modify = vi.fn();
	const process = vi.fn();
	const renameFile = vi.fn();
	const plugin = {
		settings: { maxChunks: 8 },
		indexer: { search: vi.fn(() => []) },
		app: {
			vault: {
				getFileByPath: (path: string) => files[path] ?? null,
				getAbstractFileByPath: (path: string) => files[path] ?? null,
				create,
				modify,
				process,
				cachedRead: vi.fn(),
			},
			fileManager: { renameFile },
			workspace: { activeEditor: null },
		},
	};
	return { plugin, create, modify, process, renameFile };
}

describe('getToolDefinitions', () => {
	it('includes search only when requested', () => {
		expect(getToolDefinitions(true).map((tool) => tool.name)).toEqual([
			'search_notes',
			'read_note',
			'propose_create_note',
			'propose_update_note',
			'propose_move_note',
		]);
		expect(getToolDefinitions(false).map((tool) => tool.name)).toEqual([
			'read_note',
			'propose_create_note',
			'propose_update_note',
			'propose_move_note',
		]);
	});
});

describe('buildNoteProposal', () => {
	it('rejects missing fields and invalid paths', () => {
		const { plugin } = pluginStub();
		expect(buildNoteProposal(plugin as never, 'create', undefined, 'hi')).toEqual({
			ok: false,
			error: 'create requires path and content.',
		});
		expect(buildNoteProposal(plugin as never, 'create', '../escape.md', 'hi').ok).toBe(false);
		expect(buildNoteProposal(plugin as never, 'create', '/abs.md', 'hi').ok).toBe(false);
	});

	it('allows create for a missing file and rejects update when the note is absent', () => {
		const { plugin } = pluginStub();
		expect(buildNoteProposal(plugin as never, 'create', '[[Inbox/New]]', 'hello')).toEqual({
			ok: true,
			proposal: { action: 'create', path: 'Inbox/New', content: 'hello' },
		});
		expect(buildNoteProposal(plugin as never, 'update', 'Missing.md', 'x')).toEqual({
			ok: false,
			error: 'Note not found. Use propose_create_note for a new file.',
		});
	});

	it('accepts update when the markdown file exists', () => {
		const { plugin } = pluginStub({ 'Inbox/Old.md': { path: 'Inbox/Old.md', extension: 'md' } });
		expect(buildNoteProposal(plugin as never, 'update', 'Inbox/Old.md', 'new')).toEqual({
			ok: true,
			proposal: { action: 'update', path: 'Inbox/Old.md', content: 'new' },
		});
	});
});

describe('buildMoveProposal', () => {
	const inbox = { 'Inbox/Note.md': { path: 'Inbox/Note.md', extension: 'md' } };

	it('rejects missing fields and invalid paths', () => {
		const { plugin } = pluginStub(inbox);
		expect(buildMoveProposal(plugin as never, undefined, 'Archive')).toEqual({
			ok: false,
			error: 'move requires path and destination_folder.',
		});
		expect(buildMoveProposal(plugin as never, 'Inbox/Note.md', undefined)).toEqual({
			ok: false,
			error: 'move requires path and destination_folder.',
		});
		expect(buildMoveProposal(plugin as never, '../escape.md', 'Archive').ok).toBe(false);
		expect(buildMoveProposal(plugin as never, '/abs.md', 'Archive').ok).toBe(false);
		expect(buildMoveProposal(plugin as never, 'Inbox/Note.md', '../outside').ok).toBe(false);
	});

	it('rejects a missing source, a note-like destination, same folder, and collisions', () => {
		const { plugin } = pluginStub({
			...inbox,
			'Archive/Note.md': { path: 'Archive/Note.md', extension: 'md' },
		});
		expect(buildMoveProposal(plugin as never, 'Missing.md', 'Archive')).toEqual({
			ok: false,
			error: 'Note not found. Use an existing markdown note path.',
		});
		expect(buildMoveProposal(plugin as never, 'Inbox/Note.md', 'Archive/Note.md')).toEqual({
			ok: false,
			error: 'destination_folder must be a folder, not a markdown note path.',
		});
		expect(buildMoveProposal(plugin as never, 'Inbox/Note.md', 'Inbox')).toEqual({
			ok: false,
			error: 'Note is already in that folder.',
		});
		expect(buildMoveProposal(plugin as never, 'Inbox/Note.md', 'Archive')).toEqual({
			ok: false,
			error: 'A file already exists at the destination.',
		});
	});

	it('rejects a destination folder path that is already a file', () => {
		const { plugin } = pluginStub({
			...inbox,
			Archive: { path: 'Archive', extension: '' },
		});
		expect(buildMoveProposal(plugin as never, 'Inbox/Note.md', 'Archive')).toEqual({
			ok: false,
			error: 'Destination folder path is a file, not a folder.',
		});
	});

	it('accepts a wikilink source and an empty destination folder as vault root', () => {
		const { plugin } = pluginStub(inbox);
		expect(buildMoveProposal(plugin as never, '[[Inbox/Note]]', 'Projects')).toEqual({
			ok: true,
			proposal: { action: 'move', path: 'Inbox/Note.md', destination: 'Projects/Note.md' },
		});
		expect(buildMoveProposal(plugin as never, 'Inbox/Note.md', '')).toEqual({
			ok: true,
			proposal: { action: 'move', path: 'Inbox/Note.md', destination: 'Note.md' },
		});
	});
});

describe('executeTool', () => {
	it('returns text for unknown tools', async () => {
		const { plugin } = pluginStub();
		await expect(executeTool(plugin as never, 'launch_missiles', {})).resolves.toEqual({
			type: 'text',
			text: 'Unknown tool: launch_missiles',
		});
	});

	it('records write proposals without touching the vault', async () => {
		const { plugin, create, modify, process, renameFile } = pluginStub({
			'A.md': { path: 'A.md', extension: 'md' },
			'Inbox/Note.md': { path: 'Inbox/Note.md', extension: 'md' },
		});
		const created = await executeTool(plugin as never, 'propose_create_note', {
			path: 'B.md',
			content: 'new',
		});
		const updated = await executeTool(plugin as never, 'propose_update_note', {
			path: 'A.md',
			content: 'changed',
		});
		const moved = await executeTool(plugin as never, 'propose_move_note', {
			path: 'Inbox/Note.md',
			destination_folder: 'Archive',
		});
		expect(created).toMatchObject({ type: 'proposal', proposal: { action: 'create', path: 'B.md' } });
		expect(updated).toMatchObject({ type: 'proposal', proposal: { action: 'update', path: 'A.md' } });
		expect(moved).toMatchObject({
			type: 'proposal',
			proposal: { action: 'move', path: 'Inbox/Note.md', destination: 'Archive/Note.md' },
		});
		expect(create).not.toHaveBeenCalled();
		expect(modify).not.toHaveBeenCalled();
		expect(process).not.toHaveBeenCalled();
		expect(renameFile).not.toHaveBeenCalled();
	});
});
