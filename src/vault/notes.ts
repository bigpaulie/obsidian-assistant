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

export type MoveTargetResult =
	| { ok: true; file: TFile; destination: string }
	| { ok: false; error: string };

/**
 * Validate a move to another folder. Filename is unchanged. Never writes disk.
 * Empty destination folder means vault root.
 */
export function resolveMoveTarget(app: App, rawPath: string, destFolderRaw: string): MoveTargetResult {
	if (!sanitizeVaultPath(rawPath)) {
		return { ok: false, error: 'Invalid path. Use a relative vault path to a markdown note.' };
	}
	const file = resolveMarkdownFile(app, rawPath);
	if (!file) {
		return { ok: false, error: 'Note not found. Use an existing markdown note path.' };
	}

	const folder = parseDestinationFolder(destFolderRaw);
	if (!folder.ok) {
		return folder;
	}
	if (folder.path && app.vault.getFileByPath(folder.path)) {
		return { ok: false, error: 'Destination folder path is a file, not a folder.' };
	}

	const destination = folder.path
		? normalizePath(`${folder.path}/${filename(file.path)}`)
		: filename(file.path);
	if (destination === file.path) {
		return { ok: false, error: 'Note is already in that folder.' };
	}
	if (app.vault.getAbstractFileByPath(destination)) {
		return { ok: false, error: 'A file already exists at the destination.' };
	}
	return { ok: true, file, destination };
}

export async function moveNote(app: App, rawPath: string, destFolderRaw: string): Promise<TFile> {
	const result = resolveMoveTarget(app, rawPath, destFolderRaw);
	if (!result.ok) {
		throw new Error(result.error);
	}
	await ensureFolder(app, dirname(result.destination));
	await app.fileManager.renameFile(result.file, result.destination);
	return app.vault.getFileByPath(result.destination) ?? result.file;
}

function parseDestinationFolder(raw: string): { ok: true; path: string } | { ok: false; error: string } {
	const trimmed = raw.trim().replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
	if (!trimmed) {
		return { ok: true, path: '' };
	}
	const sanitized = sanitizeVaultPath(raw);
	if (!sanitized) {
		return { ok: false, error: 'Invalid destination folder. Use a relative vault folder path.' };
	}
	if (sanitized.toLowerCase().endsWith('.md')) {
		return { ok: false, error: 'destination_folder must be a folder, not a markdown note path.' };
	}
	return { ok: true, path: sanitized };
}

function filename(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx >= 0 ? path.slice(idx + 1) : path;
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
