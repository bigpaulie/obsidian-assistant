import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
	canonicalizeExcludeFolders,
	dirname,
	ensureMarkdownPath,
	isExcludedPath,
	isFolderExclusionInherited,
	parseExcludeFolders,
	resolveMarkdownFile,
	sanitizeVaultPath,
	serializeExcludeFolders,
	stem,
	toggleExcludedFolder,
} from '../../src/vault/paths';

describe('sanitizeVaultPath', () => {
	it('normalizes relative markdown paths and strips wikilink wrappers', () => {
		expect(sanitizeVaultPath('Folder/Note.md')).toBe('Folder/Note.md');
		expect(sanitizeVaultPath('  [[Folder/Note]]  ')).toBe('Folder/Note');
		expect(sanitizeVaultPath('Folder\\Note.md')).toBe('Folder/Note.md');
	});

	it('rejects empty, nul, absolute, and parent-escape paths', () => {
		expect(sanitizeVaultPath('')).toBeNull();
		expect(sanitizeVaultPath('   ')).toBeNull();
		expect(sanitizeVaultPath('foo\0bar')).toBeNull();
		expect(sanitizeVaultPath('/etc/passwd')).toBeNull();
		expect(sanitizeVaultPath('C:\\Windows\\note.md')).toBeNull();
		expect(sanitizeVaultPath('c:/Windows/note.md')).toBeNull();
		expect(sanitizeVaultPath('.')).toBeNull();
		expect(sanitizeVaultPath('..')).toBeNull();
		expect(sanitizeVaultPath('../secret.md')).toBeNull();
		expect(sanitizeVaultPath('Folder/../outside.md')).toBeNull();
	});
});

describe('ensureMarkdownPath', () => {
	it('appends .md unless the path already ends with it', () => {
		expect(ensureMarkdownPath('Folder/Note')).toBe('Folder/Note.md');
		expect(ensureMarkdownPath('Folder/Note.md')).toBe('Folder/Note.md');
		expect(ensureMarkdownPath('Folder/Note.MD')).toBe('Folder/Note.MD');
	});
});

describe('parseExcludeFolders', () => {
	it('normalizes folder lines', () => {
		expect(parseExcludeFolders('archive\\\n# skip\nTemplates')).toEqual(['archive', 'Templates']);
	});
});

describe('canonicalizeExcludeFolders', () => {
	it('drops paths nested under another selected folder', () => {
		expect(canonicalizeExcludeFolders(['archive/old', 'archive', 'Templates'])).toEqual(['Templates', 'archive']);
	});

	it('keeps sibling prefixes like archive and archive-other', () => {
		expect(canonicalizeExcludeFolders(['archive', 'archive-other'])).toEqual(['archive', 'archive-other']);
	});
});

describe('isFolderExclusionInherited', () => {
	it('is true only for descendants of a selected folder', () => {
		expect(isFolderExclusionInherited('archive/old', ['archive'])).toBe(true);
		expect(isFolderExclusionInherited('archive', ['archive'])).toBe(false);
		expect(isFolderExclusionInherited('archive-other', ['archive'])).toBe(false);
	});
});

describe('toggleExcludedFolder', () => {
	it('adds a folder and drops selected descendants', () => {
		expect(toggleExcludedFolder('archive', ['archive/old', 'Templates'])).toEqual(['Templates', 'archive']);
	});

	it('removes a directly selected folder', () => {
		expect(toggleExcludedFolder('archive', ['archive', 'Templates'])).toEqual(['Templates']);
	});

	it('is a no-op when the folder is inherited from a parent', () => {
		expect(toggleExcludedFolder('archive/old', ['archive'])).toEqual(['archive']);
	});

	it('does not treat sibling prefixes as inherited', () => {
		expect(toggleExcludedFolder('archive-other', ['archive'])).toEqual(['archive', 'archive-other']);
	});
});

describe('serializeExcludeFolders', () => {
	it('joins canonical paths with newlines', () => {
		expect(serializeExcludeFolders(['archive/old', 'archive'])).toBe('archive');
		expect(serializeExcludeFolders([])).toBe('');
	});
});

describe('isExcludedPath', () => {
	it('treats the config dir and listed folders as prefixes', () => {
		expect(isExcludedPath('.obsidian/plugins/x', [], '.obsidian')).toBe(true);
		expect(isExcludedPath('.obsidian', [], '.obsidian')).toBe(true);
		expect(isExcludedPath('archive/old.md', ['archive'], '.obsidian')).toBe(true);
		expect(isExcludedPath('archive', ['archive'], '.obsidian')).toBe(true);
		expect(isExcludedPath('notes/a.md', ['archive'], '.obsidian')).toBe(false);
		expect(isExcludedPath('archive-other/a.md', ['archive'], '.obsidian')).toBe(false);
	});
});

describe('dirname and stem', () => {
	it('splits vault paths and strips a trailing .md', () => {
		expect(dirname('Folder/Sub/Note.md')).toBe('Folder/Sub');
		expect(dirname('Note.md')).toBe('');
		expect(dirname('/Note.md')).toBe('');
		expect(stem('Folder/Note.md')).toEqual({ dir: 'Folder', name: 'Note' });
		expect(stem('Note.MD')).toEqual({ dir: '', name: 'Note' });
	});
});

describe('resolveMarkdownFile', () => {
	function appWith(files: Record<string, Pick<TFile, 'path' | 'extension'>>): App {
		return {
			vault: {
				getFileByPath: (path: string) => files[path] ?? null,
			},
		} as unknown as App;
	}

	it('resolves raw and implied .md paths, ignoring non-markdown', () => {
		const md = { path: 'Folder/Note.md', extension: 'md' };
		const txt = { path: 'Folder/Note.txt', extension: 'txt' };
		const app = appWith({
			'Folder/Note.md': md,
			'Folder/Note.txt': txt,
		});
		expect(resolveMarkdownFile(app, 'Folder/Note.md')).toEqual(md);
		expect(resolveMarkdownFile(app, 'Folder/Note')).toEqual(md);
		expect(resolveMarkdownFile(app, 'missing')).toBeNull();
		expect(resolveMarkdownFile(app, '../escape')).toBeNull();
	});
});
