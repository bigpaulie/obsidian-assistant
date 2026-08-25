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

/** Drop paths nested under another selected folder. Sort for stable storage. */
export function canonicalizeExcludeFolders(selected: string[]): string[] {
	const unique = [...new Set(selected.map((folder) => normalizePath(folder)).filter(Boolean))].sort();
	return unique.filter((path) => !unique.some((other) => other !== path && path.startsWith(`${other}/`)));
}

export function isFolderExclusionInherited(path: string, selected: string[]): boolean {
	return selected.some((folder) => path.startsWith(`${folder}/`));
}

export function toggleExcludedFolder(path: string, selected: string[]): string[] {
	const normalized = normalizePath(path);
	const current = canonicalizeExcludeFolders(selected);
	if (!normalized || isFolderExclusionInherited(normalized, current)) {
		return current;
	}
	if (current.includes(normalized)) {
		return current.filter((folder) => folder !== normalized);
	}
	return canonicalizeExcludeFolders([...current, normalized]);
}

export function serializeExcludeFolders(selected: string[]): string {
	return canonicalizeExcludeFolders(selected).join('\n');
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
