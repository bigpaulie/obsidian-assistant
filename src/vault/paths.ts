import { App, TFile, normalizePath } from 'obsidian';
import { parseFolderList } from '../utils';

const WINDOWS_ABS = /^[a-zA-Z]:[\\/]/;

/**
 * Normalize a user- or model-supplied vault path.
 * Returns null when the path is empty, absolute, or tries to escape the vault.
 */
export function sanitizeVaultPath(raw: string): string | null {
	const trimmed = raw.trim().replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
	if (!trimmed) {
		return null;
	}
	if (trimmed.includes('\0')) {
		return null;
	}
	if (trimmed.startsWith('/') || WINDOWS_ABS.test(trimmed)) {
		return null;
	}
	const normalized = normalizePath(trimmed);
	if (!normalized || normalized === '.' || normalized === '..') {
		return null;
	}
	const parts = normalized.split('/');
	if (parts.some((part) => part === '..')) {
		return null;
	}
	return normalized;
}

export function ensureMarkdownPath(path: string): string {
	if (path.toLowerCase().endsWith('.md')) {
		return path;
	}
	return `${path}.md`;
}

export function parseExcludeFolders(raw: string): string[] {
	return parseFolderList(raw).map((folder) => normalizePath(folder)).filter(Boolean);
}

export function isExcludedPath(path: string, excludeFolders: string[], configDir: string): boolean {
	const config = normalizePath(configDir);
	if (path === config || path.startsWith(`${config}/`)) {
		return true;
	}
	for (const folder of excludeFolders) {
		if (path === folder || path.startsWith(`${folder}/`)) {
			return true;
		}
	}
	return false;
}

/** Resolve a sanitized path to a markdown file in this vault. */
export function resolveMarkdownFile(app: App, rawPath: string): TFile | null {
	const sanitized = sanitizeVaultPath(rawPath);
	if (!sanitized) {
		return null;
	}
	const candidates = [sanitized];
	if (!sanitized.toLowerCase().endsWith('.md')) {
		candidates.push(`${sanitized}.md`);
	}
	for (const candidate of candidates) {
		const file = app.vault.getFileByPath(candidate);
		if (file && file.extension === 'md') {
			return file;
		}
	}
	return null;
}

export function dirname(path: string): string {
	const idx = path.lastIndexOf('/');
	if (idx <= 0) {
		return '';
	}
	return path.slice(0, idx);
}

export function stem(path: string): { dir: string; name: string } {
	const dir = dirname(path);
	const base = dir ? path.slice(dir.length + 1) : path;
	const name = base.replace(/\.md$/i, '');
	return { dir, name };
}
