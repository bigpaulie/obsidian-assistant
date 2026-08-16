import { App, TFile } from 'obsidian';
import { MAX_REFERENCED_NOTES, MAX_TOOL_RESULT_CHARS } from '../constants';
import { truncate } from '../utils';
import { isExcludedPath, parseExcludeFolders } from './paths';

export interface ReferencedNote {
	path: string;
	content: string;
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

/** Extract wikilink targets from markdown (ignores aliases and headings). */
export function parseWikilinkTargets(text: string): string[] {
	const targets: string[] = [];
	for (const match of text.matchAll(WIKILINK_RE)) {
		const target = match[1]?.trim();
		if (target) {
			targets.push(target);
		}
	}
	return targets;
}

/**
 * Union of chip paths and `[[wikilinks]]` in the message.
 * Chip paths use `getFileByPath`; links use `getFirstLinkpathDest`.
 */
export function collectReferencedFiles(
	app: App,
	chipPaths: string[],
	message: string,
	sourcePath: string,
	excludeFoldersRaw: string,
): TFile[] {
	const exclude = parseExcludeFolders(excludeFoldersRaw);
	const configDir = app.vault.configDir;
	const seen = new Set<string>();
	const files: TFile[] = [];

	const add = (file: TFile | null): void => {
		if (!file || file.extension !== 'md') {
			return;
		}
		if (isExcludedPath(file.path, exclude, configDir)) {
			return;
		}
		if (seen.has(file.path)) {
			return;
		}
		if (files.length >= MAX_REFERENCED_NOTES) {
			return;
		}
		seen.add(file.path);
		files.push(file);
	};

	for (const path of chipPaths) {
		add(app.vault.getFileByPath(path));
	}
	for (const link of parseWikilinkTargets(message)) {
		add(app.metadataCache.getFirstLinkpathDest(link, sourcePath));
	}
	return files;
}

/** Read referenced notes with the same truncation used for tool payloads. */
export async function loadReferencedNotes(app: App, files: TFile[]): Promise<ReferencedNote[]> {
	const notes: ReferencedNote[] = [];
	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		notes.push({ path: file.path, content: truncate(content, MAX_TOOL_RESULT_CHARS) });
	}
	return notes;
}

export function formatReferencedNotes(notes: ReferencedNote[]): string {
	if (notes.length === 0) {
		return '';
	}
	return notes.map((note) => `[[${note.path}]]\n${note.content}`).join('\n\n---\n\n');
}
