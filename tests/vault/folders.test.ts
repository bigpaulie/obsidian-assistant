import { TAbstractFile, TFolder } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
	collectFolderTree,
	existingFolderPaths,
	missingExcludeFolders,
	type FolderTreeNode,
} from '../../src/vault/folders';

const tree: FolderTreeNode[] = [
	{
		path: 'archive',
		name: 'archive',
		children: [{ path: 'archive/old', name: 'old', children: [] }],
	},
	{ path: 'Templates', name: 'Templates', children: [] },
];

function folder(path: string, children: TAbstractFile[] = []): TFolder {
	return Object.assign(Object.create(TFolder.prototype) as TFolder, {
		path,
		name: path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path,
		children,
	});
}

describe('collectFolderTree', () => {
	it('skips the config dir and files, and sorts by name', () => {
		const file = Object.assign(Object.create(TAbstractFile.prototype) as TAbstractFile, {
			path: 'Notes/a.md',
			name: 'a.md',
		});
		const notes = folder('Notes', [file, folder('Notes/Sub')]);
		const config = folder('.obsidian', [folder('.obsidian/plugins')]);
		const templates = folder('Templates');
		const root = folder('/', [templates, notes, config]);
		expect(collectFolderTree(root, '.obsidian')).toEqual([
			{
				path: 'Notes',
				name: 'Notes',
				children: [{ path: 'Notes/Sub', name: 'Sub', children: [] }],
			},
			{ path: 'Templates', name: 'Templates', children: [] },
		]);
	});
});

describe('existingFolderPaths', () => {
	it('collects nested folder paths', () => {
		expect([...existingFolderPaths(tree)].sort()).toEqual(['Templates', 'archive', 'archive/old']);
	});
});

describe('missingExcludeFolders', () => {
	it('returns selected paths that are not in the vault tree', () => {
		const existing = existingFolderPaths(tree);
		expect(missingExcludeFolders(['archive', 'Gone', 'archive/old'], existing)).toEqual(['Gone']);
	});
});
