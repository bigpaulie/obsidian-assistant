import MiniSearch from 'minisearch';
import { TAbstractFile, TFile, normalizePath } from 'obsidian';
import {
	FILE_INDEX_DEBOUNCE_MS,
	INDEX_FILE_NAME,
	INDEX_PERSIST_DEBOUNCE_MS,
	MAX_RETRIEVED_CHARS,
	MAX_SEARCH_HITS,
} from '../constants';
import { debugLog } from '../debug';
import type VaultAssistantPlugin from '../main';
import { truncate } from '../utils';
import { isExcludedPath, parseExcludeFolders } from '../vault/paths';
import { chunkNote, type IndexedChunk } from './chunker';

const MINISEARCH_OPTIONS = {
	fields: ['title', 'path', 'tags', 'headings', 'body'],
	storeFields: ['path', 'title', 'tags', 'headings', 'body'],
	searchOptions: {
		boost: { title: 3, headings: 2, tags: 2, path: 1.5, body: 1 },
		prefix: true,
		fuzzy: 0.2,
	},
};

export interface SearchHit {
	path: string;
	title: string;
	headings: string;
	snippet: string;
	score: number;
}

/**
 * Local MiniSearch index over markdown notes.
 * Persistence lives in the plugin folder, not as a vault note.
 */
export class VaultIndexer {
	private mini = new MiniSearch<IndexedChunk>(MINISEARCH_OPTIONS);
	private idsByPath = new Map<string, string[]>();
	private mtimes = new Map<string, number>();
	private fileTimers = new Map<string, number>();
	private persistTimer: number | null = null;
	private started = false;
	chunkCount = 0;

	constructor(private readonly plugin: VaultAssistantPlugin) {}

	async start(): Promise<void> {
		if (this.started) {
			return;
		}
		this.started = true;
		this.registerVaultEvents();
		const loaded = await this.loadPersisted();
		if (!loaded) {
			await this.rebuild();
			return;
		}
		await this.reconcile();
	}

	async rebuild(): Promise<void> {
		this.mini = new MiniSearch<IndexedChunk>(MINISEARCH_OPTIONS);
		this.idsByPath.clear();
		this.mtimes.clear();
		const exclude = parseExcludeFolders(this.plugin.settings.excludeFolders);
		const configDir = this.plugin.app.vault.configDir;
		const files = this.plugin.app.vault.getMarkdownFiles();
		for (const file of files) {
			if (isExcludedPath(file.path, exclude, configDir)) {
				continue;
			}
			await this.indexFile(file);
		}
		this.chunkCount = this.mini.documentCount;
		await this.persistNow();
	}

	search(query: string, limit = this.plugin.settings.maxChunks || MAX_SEARCH_HITS): SearchHit[] {
		const trimmed = query.trim();
		if (!trimmed || this.mini.documentCount === 0) {
			return [];
		}
		const results = this.mini.search(trimmed);
		const hits: SearchHit[] = [];
		let used = 0;
		for (const result of results) {
			if (hits.length >= limit || used >= MAX_RETRIEVED_CHARS) {
				break;
			}
			const body = typeof result.body === 'string' ? result.body : '';
			const snippet = truncate(body, 600);
			used += snippet.length;
			hits.push({
				path: String(result.path ?? ''),
				title: String(result.title ?? ''),
				headings: String(result.headings ?? ''),
				snippet,
				score: result.score,
			});
		}
		return hits;
	}

	unload(): void {
		for (const timer of this.fileTimers.values()) {
			window.clearTimeout(timer);
		}
		this.fileTimers.clear();
		if (this.persistTimer !== null) {
			window.clearTimeout(this.persistTimer);
			this.persistTimer = null;
		}
	}

	private registerVaultEvents(): void {
		const vault = this.plugin.app.vault;
		this.plugin.registerEvent(vault.on('create', (file) => this.scheduleFile(file)));
		this.plugin.registerEvent(vault.on('modify', (file) => this.scheduleFile(file)));
		this.plugin.registerEvent(vault.on('delete', (file) => this.removePath(file.path)));
		this.plugin.registerEvent(
			vault.on('rename', (file, oldPath) => {
				this.removePath(oldPath);
				this.scheduleFile(file);
			}),
		);
	}

	private scheduleFile(file: TAbstractFile): void {
		if (!(file instanceof TFile) || file.extension !== 'md') {
			return;
		}
		const existing = this.fileTimers.get(file.path);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}
		const timer = window.setTimeout(() => {
			this.fileTimers.delete(file.path);
			void this.reindexFile(file);
		}, FILE_INDEX_DEBOUNCE_MS);
		this.fileTimers.set(file.path, timer);
	}

	private async reindexFile(file: TFile): Promise<void> {
		const exclude = parseExcludeFolders(this.plugin.settings.excludeFolders);
		this.removePath(file.path);
		if (isExcludedPath(file.path, exclude, this.plugin.app.vault.configDir)) {
			this.schedulePersist();
			return;
		}
		await this.indexFile(file);
		this.chunkCount = this.mini.documentCount;
		this.schedulePersist();
	}

	private async indexFile(file: TFile): Promise<void> {
		const content = await this.plugin.app.vault.cachedRead(file);
		const cache = this.plugin.app.metadataCache.getFileCache(file);
		const chunks = chunkNote(file, content, cache);
		const ids: string[] = [];
		for (const chunk of chunks) {
			if (this.mini.has(chunk.id)) {
				this.mini.discard(chunk.id);
			}
			this.mini.add(chunk);
			ids.push(chunk.id);
		}
		this.idsByPath.set(file.path, ids);
		this.mtimes.set(file.path, file.stat.mtime);
	}

	private removePath(path: string): void {
		const ids = this.idsByPath.get(path);
		if (!ids) {
			return;
		}
		for (const id of ids) {
			if (this.mini.has(id)) {
				this.mini.discard(id);
			}
		}
		this.idsByPath.delete(path);
		this.mtimes.delete(path);
		this.chunkCount = this.mini.documentCount;
		this.schedulePersist();
	}

	private async reconcile(): Promise<void> {
		const exclude = parseExcludeFolders(this.plugin.settings.excludeFolders);
		const configDir = this.plugin.app.vault.configDir;
		const seen = new Set<string>();
		for (const file of this.plugin.app.vault.getMarkdownFiles()) {
			seen.add(file.path);
			if (isExcludedPath(file.path, exclude, configDir)) {
				this.removePath(file.path);
				continue;
			}
			if (this.mtimes.get(file.path) !== file.stat.mtime) {
				this.removePath(file.path);
				await this.indexFile(file);
			}
		}
		for (const path of [...this.idsByPath.keys()]) {
			if (!seen.has(path)) {
				this.removePath(path);
			}
		}
		this.chunkCount = this.mini.documentCount;
		await this.persistNow();
	}

	private indexPath(): string {
		const dir = this.plugin.manifest.dir ?? '';
		return normalizePath(`${dir}/${INDEX_FILE_NAME}`);
	}

	private async loadPersisted(): Promise<boolean> {
		const path = this.indexPath();
		const adapter = this.plugin.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			return false;
		}
		try {
			const raw = await adapter.read(path);
			const parsed = JSON.parse(raw) as PersistedIndex;
			if (!parsed?.mini) {
				return false;
			}
			this.mini = MiniSearch.loadJSON<IndexedChunk>(JSON.stringify(parsed.mini), MINISEARCH_OPTIONS);
			this.idsByPath = new Map(Object.entries(parsed.idsByPath ?? {}));
			this.mtimes = new Map(Object.entries(parsed.mtimes ?? {}).map(([path, mtime]) => [path, Number(mtime)]));
			this.chunkCount = this.mini.documentCount;
			return this.chunkCount > 0;
		} catch (error) {
			debugLog(this.plugin.settings, 'index.load.failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	private schedulePersist(): void {
		if (this.persistTimer !== null) {
			window.clearTimeout(this.persistTimer);
		}
		this.persistTimer = window.setTimeout(() => {
			this.persistTimer = null;
			void this.persistNow();
		}, INDEX_PERSIST_DEBOUNCE_MS);
	}

	private async persistNow(): Promise<void> {
		const path = this.indexPath();
		try {
			const payload: PersistedIndex = {
				version: 1,
				mini: this.mini.toJSON(),
				idsByPath: Object.fromEntries(this.idsByPath),
				mtimes: Object.fromEntries(this.mtimes),
			};
			await this.plugin.app.vault.adapter.write(path, JSON.stringify(payload));
		} catch (error) {
			// Index persistence is best-effort; search still works in memory.
			debugLog(this.plugin.settings, 'index.persist.failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

interface PersistedIndex {
	version: number;
	mini: unknown;
	idsByPath?: Record<string, string[]>;
	mtimes?: Record<string, number>;
}
