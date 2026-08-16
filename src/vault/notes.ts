import { App, MarkdownView, TFile, normalizePath } from 'obsidian';
import {
	dirname,
	ensureMarkdownPath,
	resolveMarkdownFile,
	sanitizeVaultPath,
	stem,
} from './paths';

export async function readNote(app: App, rawPath: string): Promise<string> {
	const file = resolveMarkdownFile(app, rawPath);
	if (!file) {
		throw new Error('Note not found in the vault.');
	}
	return app.vault.cachedRead(file);
}

export async function createNote(app: App, rawPath: string, content: string): Promise<TFile> {
	const sanitized = sanitizeVaultPath(rawPath);
	if (!sanitized) {
		throw new Error('Invalid note path.');
	}
	const target = ensureMarkdownPath(sanitized);
	const unique = uniqueMarkdownPath(app, target);
	await ensureFolder(app, dirname(unique));
	return app.vault.create(unique, content);
}

export async function updateNote(app: App, rawPath: string, content: string): Promise<TFile> {
	const file = resolveMarkdownFile(app, rawPath);
	if (!file) {
		throw new Error('Note not found in the vault.');
	}

	const active = app.workspace.activeEditor;
	if (active?.file?.path === file.path && active.editor) {
		active.editor.setValue(content);
		return file;
	}

	const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
	if (markdownView?.file?.path === file.path && markdownView.editor) {
		markdownView.editor.setValue(content);
		return file;
	}

	await app.vault.process(file, () => content);
	return file;
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	if (!folderPath) {
		return;
	}
	if (app.vault.getFolderByPath(folderPath)) {
		return;
	}
	await ensureFolder(app, dirname(folderPath));
	await app.vault.createFolder(folderPath);
}

function uniqueMarkdownPath(app: App, path: string): string {
	if (!app.vault.getAbstractFileByPath(path)) {
		return path;
	}
	const { dir, name } = stem(path);
	let i = 1;
	while (true) {
		const candidate = normalizePath(dir ? `${dir}/${name} ${i}.md` : `${name} ${i}.md`);
		if (!app.vault.getAbstractFileByPath(candidate)) {
			return candidate;
		}
		i += 1;
	}
}

export function getActiveMarkdownPath(app: App): string | null {
	const file = app.workspace.getActiveFile();
	if (file instanceof TFile && file.extension === 'md') {
		return file.path;
	}
	return null;
}

/** Markdown files currently open in tabs. Deduped by path. */
export function getOpenMarkdownFiles(app: App): TFile[] {
	const seen = new Set<string>();
	const files: TFile[] = [];
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) {
			continue;
		}
		const file = leaf.view.file;
		if (seen.has(file.path)) {
			continue;
		}
		seen.add(file.path);
		files.push(file);
	}
	return files;
}
