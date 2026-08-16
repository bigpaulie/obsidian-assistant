export const PLUGIN_NAME = 'Vault Assistant';
export const VIEW_TYPE_CHAT = 'vault-assistant-chat';
export const INDEX_FILE_NAME = 'search-index.json';

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export const DEFAULT_MODELS: Record<'openai' | 'openrouter' | 'ollama', string> = {
	openai: 'gpt-4o-mini',
	openrouter: 'openai/gpt-4o-mini',
	ollama: 'llama3.1',
};

export const MAX_TOOL_ROUNDS = 5;
export const MAX_CHUNK_CHARS = 1000;
export const MAX_RETRIEVED_CHARS = 12_000;
export const MAX_TOOL_RESULT_CHARS = 8_000;
export const MAX_SEARCH_HITS = 8;
export const MAX_REFERENCED_NOTES = 10;
export const INDEX_PERSIST_DEBOUNCE_MS = 2_000;
export const FILE_INDEX_DEBOUNCE_MS = 400;
