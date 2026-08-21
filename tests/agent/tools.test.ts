import { describe, expect, it, vi } from 'vitest';
import { buildNoteProposal, executeTool, getToolDefinitions } from '../../src/agent/tools';

function pluginStub(files: Record<string, { path: string; extension: string }> = {}) {
	const create = vi.fn();
	const modify = vi.fn();
	const process = vi.fn();
	const plugin = {
		settings: { maxChunks: 8 },
		indexer: { search: vi.fn(() => []) },
		app: {
			vault: {
				getFileByPath: (path: string) => files[path] ?? null,
				create,
				modify,
				process,
				cachedRead: vi.fn(),
			},
			workspace: { activeEditor: null },
		},
	};
	return { plugin, create, modify, process };
}

describe('getToolDefinitions', () => {
	it('includes search only when requested', () => {
		expect(getToolDefinitions(true).map((tool) => tool.name)).toEqual([
			'search_notes',
			'read_note',
			'propose_create_note',
			'propose_update_note',
		]);
		expect(getToolDefinitions(false).map((tool) => tool.name)).toEqual([
			'read_note',
			'propose_create_note',
			'propose_update_note',
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

describe('executeTool', () => {
	it('returns text for unknown tools', async () => {
		const { plugin } = pluginStub();
		await expect(executeTool(plugin as never, 'launch_missiles', {})).resolves.toEqual({
			type: 'text',
			text: 'Unknown tool: launch_missiles',
		});
	});

	it('records write proposals without touching the vault', async () => {
		const { plugin, create, modify, process } = pluginStub({
			'A.md': { path: 'A.md', extension: 'md' },
		});
		const created = await executeTool(plugin as never, 'propose_create_note', {
			path: 'B.md',
			content: 'new',
		});
		const updated = await executeTool(plugin as never, 'propose_update_note', {
			path: 'A.md',
			content: 'changed',
		});
		expect(created).toMatchObject({ type: 'proposal', proposal: { action: 'create', path: 'B.md' } });
		expect(updated).toMatchObject({ type: 'proposal', proposal: { action: 'update', path: 'A.md' } });
		expect(create).not.toHaveBeenCalled();
		expect(modify).not.toHaveBeenCalled();
		expect(process).not.toHaveBeenCalled();
	});
});
