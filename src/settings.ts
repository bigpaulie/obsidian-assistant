import { DEFAULT_MODELS, DEFAULT_OLLAMA_URL } from './constants';

export type ProviderId = 'openai' | 'openrouter' | 'ollama';

export interface VaultAssistantSettings {
	provider: ProviderId;
	openaiApiKey: string;
	openrouterApiKey: string;
	ollamaUrl: string;
	ollamaApiKey: string;
	model: string;
	temperature: number;
	maxTokens: number;
	systemPrompt: string;
	ragEnabled: boolean;
	maxChunks: number;
	excludeFolders: string;
	privacyAcknowledged: boolean;
	debugMode: boolean;
	showReplyMeta: boolean;
}

export const DEFAULT_SETTINGS: VaultAssistantSettings = {
	provider: 'openai',
	openaiApiKey: '',
	openrouterApiKey: '',
	ollamaUrl: DEFAULT_OLLAMA_URL,
	ollamaApiKey: '',
	model: DEFAULT_MODELS.openai,
	temperature: 0.3,
	maxTokens: 2048,
	systemPrompt: '',
	ragEnabled: true,
	maxChunks: 8,
	excludeFolders: '',
	privacyAcknowledged: false,
	debugMode: false,
	showReplyMeta: true,
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
	openai: 'OpenAI',
	openrouter: 'OpenRouter',
	ollama: 'Ollama',
};
