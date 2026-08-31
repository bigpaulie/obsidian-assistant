import { normalizePath } from 'obsidian';
import {
	MAX_SAVED_PROMPTS,
	SAVED_PROMPTS_FILE_NAME,
	SAVED_PROMPTS_PERSIST_DEBOUNCE_MS,
} from '../constants';
import { debugLog } from '../debug';
import type VaultAssistantPlugin from '../main';
import { asFiniteNumber, asString, isRecord } from '../utils';

export const SAVED_PROMPTS_VERSION = 1;

export interface SavedPrompt {
	id: string;
	name: string;
	content: string;
	updatedAt: number;
}

export interface SavedPromptsFile {
	version: number;
	prompts: SavedPrompt[];
}

/** Empty on-disk shape. */
export function emptySavedPromptsFile(): SavedPromptsFile {
	return { version: SAVED_PROMPTS_VERSION, prompts: [] };
}

function parsePrompt(value: unknown): SavedPrompt | null {
	if (!isRecord(value)) {
		return null;
	}
	const id = asString(value.id)?.trim();
	const name = asString(value.name)?.trim();
	const content = asString(value.content);
	const updatedAt = asFiniteNumber(value.updatedAt);
	if (!id || !name || content === undefined || updatedAt === undefined) {
		return null;
	}
	return { id, name, content, updatedAt };
}

/** Parse and validate a saved-prompts JSON string. Returns null if unusable. */
export function parseSavedPromptsFile(raw: string): SavedPromptsFile | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			return null;
		}
		const version = asFiniteNumber(parsed.version);
		if (version !== SAVED_PROMPTS_VERSION) {
			return null;
		}
		if (!Array.isArray(parsed.prompts)) {
			return null;
		}
		const prompts: SavedPrompt[] = [];
		for (const item of parsed.prompts) {
			const prompt = parsePrompt(item);
			if (prompt) {
				prompts.push(prompt);
			}
		}
		return {
			version: SAVED_PROMPTS_VERSION,
			prompts: capPrompts(prompts),
		};
	} catch {
		return null;
	}
}

/** Keep the newest prompts by updatedAt. */
export function capPrompts(
	prompts: SavedPrompt[],
	max: number = MAX_SAVED_PROMPTS,
): SavedPrompt[] {
	if (prompts.length <= max) {
		return [...prompts].sort((a, b) => b.updatedAt - a.updatedAt);
	}
	return [...prompts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, max);
}

/** Insert or replace a prompt, then cap the list. */
export function upsertPrompt(file: SavedPromptsFile, prompt: SavedPrompt): SavedPromptsFile {
	const others = file.prompts.filter((item) => item.id !== prompt.id);
	return {
		version: SAVED_PROMPTS_VERSION,
		prompts: capPrompts([prompt, ...others]),
	};
}

/** Remove a prompt by id. */
export function removePrompt(file: SavedPromptsFile, id: string): SavedPromptsFile {
	return {
		version: SAVED_PROMPTS_VERSION,
		prompts: file.prompts.filter((item) => item.id !== id),
	};
}

/** Find a prompt by name (case-insensitive). */
export function findPromptByName(prompts: SavedPrompt[], name: string): SavedPrompt | null {
	const needle = name.trim().toLowerCase();
	if (!needle) {
		return null;
	}
	return prompts.find((item) => item.name.toLowerCase() === needle) ?? null;
}

/** Create a new prompt id. */
export function newPromptId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Load/save reusable chat prompts in the plugin folder (not vault notes).
 */
export class SavedPromptStore {
	private cache: SavedPromptsFile | null = null;
	private persistTimer: number | null = null;
	private loaded = false;

	constructor(private readonly plugin: VaultAssistantPlugin) {}

	async list(): Promise<SavedPrompt[]> {
		const file = await this.ensureLoaded();
		return [...file.prompts].sort((a, b) => a.name.localeCompare(b.name));
	}

	async get(id: string): Promise<SavedPrompt | null> {
		const file = await this.ensureLoaded();
		return file.prompts.find((item) => item.id === id) ?? null;
	}

	async getByName(name: string): Promise<SavedPrompt | null> {
		const file = await this.ensureLoaded();
		return findPromptByName(file.prompts, name);
	}

	async upsert(prompt: SavedPrompt): Promise<void> {
		const file = await this.ensureLoaded();
		this.cache = upsertPrompt(file, prompt);
		this.schedulePersist();
	}

	async delete(id: string): Promise<void> {
		const file = await this.ensureLoaded();
		this.cache = removePrompt(file, id);
		this.schedulePersist();
	}

	async flush(): Promise<void> {
		this.clearPersistTimer();
		if (this.cache) {
			await this.persistNow();
		}
	}

	unload(): void {
		this.clearPersistTimer();
	}

	private async ensureLoaded(): Promise<SavedPromptsFile> {
		if (this.loaded && this.cache) {
			return this.cache;
		}
		this.cache = await this.loadPersisted();
		this.loaded = true;
		return this.cache;
	}

	private filePath(): string {
		const dir = this.plugin.manifest.dir ?? '';
		return normalizePath(`${dir}/${SAVED_PROMPTS_FILE_NAME}`);
	}

	private async loadPersisted(): Promise<SavedPromptsFile> {
		const path = this.filePath();
		const adapter = this.plugin.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			return emptySavedPromptsFile();
		}
		try {
			const raw = await adapter.read(path);
			return parseSavedPromptsFile(raw) ?? emptySavedPromptsFile();
		} catch (error) {
			debugLog(this.plugin.settings, 'saved-prompts.load.failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return emptySavedPromptsFile();
		}
	}

	private schedulePersist(): void {
		this.clearPersistTimer();
		this.persistTimer = window.setTimeout(() => {
			this.persistTimer = null;
			void this.persistNow();
		}, SAVED_PROMPTS_PERSIST_DEBOUNCE_MS);
	}

	private clearPersistTimer(): void {
		if (this.persistTimer !== null) {
			window.clearTimeout(this.persistTimer);
			this.persistTimer = null;
		}
	}

	private async persistNow(): Promise<void> {
		if (!this.cache) {
			return;
		}
		const path = this.filePath();
		try {
			await this.plugin.app.vault.adapter.write(path, JSON.stringify(this.cache));
		} catch (error) {
			debugLog(this.plugin.settings, 'saved-prompts.persist.failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
