import { App, normalizePath } from 'obsidian';
import { dirname } from './paths';

export const SYSTEM_NOTE_BASENAME = 'system.md';

/**
 * Walk from the active note's folder up to vault root; return the nearest system.md path.
 */
export function resolveSystemNotePath(app: App, activeNotePath: string | null): string | null {
	if (!activeNotePath) {
		return null;
	}

	let dir = dirname(activeNotePath);
	while (true) {
		const candidate = normalizePath(dir ? `${dir}/${SYSTEM_NOTE_BASENAME}` : SYSTEM_NOTE_BASENAME);
		if (app.vault.getFileByPath(candidate)) {
			return candidate;
		}
		if (!dir) {
			return null;
		}
		dir = dirname(dir);
	}
}

export async function loadSystemNoteExtra(
	app: App,
	activeNotePath: string | null,
): Promise<{ path: string; content: string } | null> {
	const path = resolveSystemNotePath(app, activeNotePath);
	if (!path) {
		return null;
	}
	const file = app.vault.getFileByPath(path);
	if (!file) {
		return null;
	}
	const content = await app.vault.cachedRead(file);
	return { path, content };
}
