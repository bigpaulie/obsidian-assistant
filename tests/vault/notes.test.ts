import { describe, expect, it, vi } from 'vitest';
import { moveNote } from '../../src/vault/notes';

function vaultApp(
	files: Record<string, { path: string; extension: string }>,
	folders: Set<string> = new Set(),
) {
	const createFolder = vi.fn(async (path: string) => {
		folders.add(path);
	});
	const renameFile = vi.fn(async (file: { path: string; extension: string }, dest: string) => {
		delete files[file.path];
		file.path = dest;
		files[dest] = file;
	});
	const app = {
		vault: {
			getFileByPath: (path: string) => files[path] ?? null,
			getAbstractFileByPath: (path: string) => files[path] ?? (folders.has(path) ? { path } : null),
			getFolderByPath: (path: string) => (folders.has(path) ? { path } : null),
			createFolder,
		},
		fileManager: { renameFile },
	};
	return { app, createFolder, renameFile };
}

describe('moveNote', () => {
	it('creates a missing destination folder then renames the note', async () => {
		const file = { path: 'Inbox/Note.md', extension: 'md' };
		const { app, createFolder, renameFile } = vaultApp({ 'Inbox/Note.md': file });
		const moved = await moveNote(app as never, 'Inbox/Note.md', 'Archive');
		expect(createFolder).toHaveBeenCalledWith('Archive');
		expect(renameFile).toHaveBeenCalledWith(file, 'Archive/Note.md');
		const createdAt = createFolder.mock.invocationCallOrder[0];
		const renamedAt = renameFile.mock.invocationCallOrder[0];
		expect(createdAt).toBeDefined();
		expect(renamedAt).toBeDefined();
		expect(createdAt ?? 0).toBeLessThan(renamedAt ?? 0);
		expect(moved.path).toBe('Archive/Note.md');
	});

	it('throws when the note is missing', async () => {
		const { app, renameFile } = vaultApp({});
		await expect(moveNote(app as never, 'Missing.md', 'Archive')).rejects.toThrow(
			'Note not found. Use an existing markdown note path.',
		);
		expect(renameFile).not.toHaveBeenCalled();
	});

	it('throws when the destination is occupied', async () => {
		const { app, renameFile } = vaultApp({
			'Inbox/Note.md': { path: 'Inbox/Note.md', extension: 'md' },
			'Archive/Note.md': { path: 'Archive/Note.md', extension: 'md' },
		});
		await expect(moveNote(app as never, 'Inbox/Note.md', 'Archive')).rejects.toThrow(
			'A file already exists at the destination.',
		);
		expect(renameFile).not.toHaveBeenCalled();
	});
});
