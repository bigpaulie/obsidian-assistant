import { requestUrl } from 'obsidian';
import { DEFAULT_OLLAMA_URL } from '../constants';
import type { VaultAssistantSettings } from '../settings';
import { isRecord } from '../utils';
import { getApiKeyForProvider, normalizeServerUrl, resolveProviderConfig } from './providers';
import type {
	ChatCompletionRequest,
	ChatCompletionResponse,
	ChatMessage,
	ModelListResponse,
} from './types';

export class LlmError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = 'LlmError';
	}
}

/**
 * Thin OpenAI-compatible client using Obsidian `requestUrl` (CORS-safe).
 * Never logs request headers or API keys.
 */
export class LlmClient {
	constructor(private readonly settings: VaultAssistantSettings) {}

	async chat(request: ChatCompletionRequest): Promise<ChatMessage> {
		this.assertReady();
		const config = resolveProviderConfig(this.settings);
		const body: ChatCompletionRequest = {
			model: request.model,
			messages: request.messages,
			temperature: request.temperature,
			max_tokens: request.max_tokens,
		};
		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools;
		}

		const json = await this.postJson(`${config.apiBaseUrl}/chat/completions`, body);
		const parsed = json as ChatCompletionResponse;
		const message = parsed.choices?.[0]?.message;
		if (!message) {
			throw new LlmError(apiErrorMessage(parsed) || 'The model returned an empty response.');
		}
		return message;
	}

	async listModels(): Promise<string[]> {
		this.assertReady();
		const config = resolveProviderConfig(this.settings);
		const json = await this.getJson(`${config.apiBaseUrl}/models`);
		const parsed = json as ModelListResponse;
		const ids = (parsed.data ?? [])
			.map((item) => item.id)
			.filter((id): id is string => typeof id === 'string' && id.length > 0);
		return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
	}

	async testConnection(): Promise<{ ok: true; modelCount: number } | { ok: false; message: string }> {
		try {
			const models = await this.listModels();
			return { ok: true, modelCount: models.length };
		} catch (error) {
			return { ok: false, message: errorMessage(error) };
		}
	}

	private assertReady(): void {
		const config = resolveProviderConfig(this.settings);
		if (config.requiresKey && !getApiKeyForProvider(this.settings).trim()) {
			throw new LlmError('Add an API key in Vault Assistant settings.');
		}
		if (this.settings.provider === 'ollama') {
			const url = this.settings.ollamaUrl.trim() || DEFAULT_OLLAMA_URL;
			if (!normalizeServerUrl(url)) {
				throw new LlmError('Ollama URL must be http(s) without credentials in the URL.');
			}
		}
	}

	private async postJson(url: string, body: unknown): Promise<unknown> {
		const config = resolveProviderConfig(this.settings);
		const response = await requestUrl({
			url,
			method: 'POST',
			headers: config.headers,
			body: JSON.stringify(body),
			throw: false,
		});
		return parseResponse(response.status, response.text);
	}

	private async getJson(url: string): Promise<unknown> {
		const config = resolveProviderConfig(this.settings);
		const response = await requestUrl({
			url,
			method: 'GET',
			headers: config.headers,
			throw: false,
		});
		return parseResponse(response.status, response.text);
	}
}

function parseResponse(status: number, text: string): unknown {
	let json: unknown = undefined;
	if (text) {
		try {
			json = JSON.parse(text) as unknown;
		} catch {
			json = undefined;
		}
	}
	if (status >= 400) {
		throw new LlmError(apiErrorMessage(json) || `Provider request failed (${status}).`, status);
	}
	if (json === undefined) {
		throw new LlmError('Provider returned a non-JSON response.');
	}
	return json;
}

function apiErrorMessage(json: unknown): string | undefined {
	if (!isRecord(json)) {
		return undefined;
	}
	if (isRecord(json.error) && typeof json.error.message === 'string') {
		return sanitizeErrorText(json.error.message);
	}
	if (typeof json.message === 'string') {
		return sanitizeErrorText(json.message);
	}
	return undefined;
}

function sanitizeErrorText(message: string): string {
	return message.replace(/sk-[a-zA-Z0-9-_]+/g, '[redacted]');
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return sanitizeErrorText(error.message);
	}
	return 'Something went wrong.';
}

export function isLikelyToolsUnsupported(error: unknown): boolean {
	const message = errorMessage(error).toLowerCase();
	return (
		message.includes('tool') ||
		message.includes('function calling') ||
		message.includes('functions') ||
		message.includes('unknown parameter')
	);
}
