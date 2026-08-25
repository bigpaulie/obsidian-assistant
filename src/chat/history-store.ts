import { normalizePath } from 'obsidian';
import {
	CHAT_HISTORY_FILE_NAME,
	CHAT_HISTORY_PERSIST_DEBOUNCE_MS,
	MAX_STORED_CONVERSATIONS,
} from '../constants';
import { debugLog } from '../debug';
import type { ChatMessage } from '../llm/types';
import type VaultAssistantPlugin from '../main';
import { asFiniteNumber, asString, isRecord } from '../utils';

export const CHAT_HISTORY_VERSION = 1;

export interface StoredConversation {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messages: ChatMessage[];
	referencedPaths: string[];
}

export interface ChatHistoryFile {
	version: number;
	conversations: StoredConversation[];
}

/** Empty on-disk shape. */
export function emptyHistoryFile(): ChatHistoryFile {
	return { version: CHAT_HISTORY_VERSION, conversations: [] };
}

/** Parse and validate a history JSON string. Returns null if unusable. */
export function parseHistoryFile(raw: string): ChatHistoryFile | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			return null;
		}
		const version = asFiniteNumber(parsed.version);
		if (version !== CHAT_HISTORY_VERSION) {
			return null;
		}
		if (!Array.isArray(parsed.conversations)) {
			return null;
		}
		const conversations: StoredConversation[] = [];
		for (const item of parsed.conversations) {
			const conv = parseConversation(item);
			if (conv) {
				conversations.push(conv);
			}
		}
		return {
			version: CHAT_HISTORY_VERSION,
			conversations: capConversations(conversations, MAX_STORED_CONVERSATIONS),
		};
	} catch {
		return null;
	}
}

function parseConversation(value: unknown): StoredConversation | null {
	if (!isRecord(value)) {
		return null;
	}
	const id = asString(value.id)?.trim();
	const title = asString(value.title) ?? '';
	const createdAt = asFiniteNumber(value.createdAt);
	const updatedAt = asFiniteNumber(value.updatedAt);
	if (!id || createdAt === undefined || updatedAt === undefined) {
		return null;
	}
	if (!Array.isArray(value.messages) || !Array.isArray(value.referencedPaths)) {
		return null;
	}
	const messages: ChatMessage[] = [];
	for (const message of value.messages) {
		const parsed = parseUiMessage(message);
		if (parsed) {
			messages.push(parsed);
		}
	}
	const referencedPaths = value.referencedPaths
		.map((path) => asString(path)?.trim())
		.filter((path): path is string => Boolean(path));
	return { id, title, createdAt, updatedAt, messages, referencedPaths };
}

function parseUiMessage(value: unknown): ChatMessage | null {
	if (!isRecord(value)) {
		return null;
	}
	const role = asString(value.role);
	if (role !== 'user' && role !== 'assistant') {
		return null;
	}
	const content = value.content;
	if (content !== null && typeof content !== 'string') {
		return null;
	}
	return { role, content };
}

/** Keep the newest conversations by updatedAt. */
export function capConversations(
	conversations: StoredConversation[],
	max: number = MAX_STORED_CONVERSATIONS,
): StoredConversation[] {
	if (conversations.length <= max) {
		return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
	}
	return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, max);
}

/** Insert or replace a conversation, then cap the list. */
export function upsertConversation(
	file: ChatHistoryFile,
	conversation: StoredConversation,
): ChatHistoryFile {
	const others = file.conversations.filter((item) => item.id !== conversation.id);
	return {
		version: CHAT_HISTORY_VERSION,
		conversations: capConversations([conversation, ...others]),
	};
}

/** Create a new conversation id. */
export function newConversationId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Load/save chat transcripts in the plugin folder (not vault notes).
 */
export class ChatHistoryStore {
	private cache: ChatHistoryFile | null = null;
	private persistTimer: number | null = null;
	private loaded = false;

	constructor(private readonly plugin: VaultAssistantPlugin) {}

	async list(): Promise<StoredConversation[]> {
		const file = await this.ensureLoaded();
		return [...file.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
	}

	async get(id: string): Promise<StoredConversation | null> {
		const file = await this.ensureLoaded();
		return file.conversations.find((item) => item.id === id) ?? null;
	}

	async upsert(conversation: StoredConversation): Promise<void> {
		const file = await this.ensureLoaded();
		this.cache = upsertConversation(file, conversation);
		this.schedulePersist();
	}

	async upsertNow(conversation: StoredConversation): Promise<void> {
		const file = await this.ensureLoaded();
		this.cache = upsertConversation(file, conversation);
		await this.persistNow();
	}

	async clear(): Promise<void> {
		this.clearPersistTimer();
		this.cache = emptyHistoryFile();
		this.loaded = true;
		const path = this.filePath();
		const adapter = this.plugin.app.vault.adapter;
		try {
			if (await adapter.exists(path)) {
				await adapter.remove(path);
			}
		} catch (error) {
			debugLog(this.plugin.settings, 'chat-history.clear.failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
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

	private async ensureLoaded(): Promise<ChatHistoryFile> {
		if (this.loaded && this.cache) {
			return this.cache;
		}
		this.cache = await this.loadPersisted();
		this.loaded = true;
		return this.cache;
	}

	private filePath(): string {
		const dir = this.plugin.manifest.dir ?? '';
		return normalizePath(`${dir}/${CHAT_HISTORY_FILE_NAME}`);
	}

	private async loadPersisted(): Promise<ChatHistoryFile> {
		const path = this.filePath();
		const adapter = this.plugin.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			return emptyHistoryFile();
		}
		try {
			const raw = await adapter.read(path);
			return parseHistoryFile(raw) ?? emptyHistoryFile();
		} catch (error) {
			debugLog(this.plugin.settings, 'chat-history.load.failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return emptyHistoryFile();
		}
	}

	private schedulePersist(): void {
		this.clearPersistTimer();
		this.persistTimer = window.setTimeout(() => {
			this.persistTimer = null;
			void this.persistNow();
		}, CHAT_HISTORY_PERSIST_DEBOUNCE_MS);
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
			debugLog(this.plugin.settings, 'chat-history.persist.failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
