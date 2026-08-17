import { requestUrl } from 'obsidian';
import { DEFAULT_OLLAMA_URL } from '../constants';
import type { VaultAssistantSettings } from '../settings';
import { isRecord } from '../utils';
import { EMPTY_MODEL_REPLY, LlmError, errorMessage, sanitizeErrorText } from './errors';
import { completionSampling } from './model-params';
import { getApiKeyForProvider, normalizeServerUrl, resolveProviderConfig } from './providers';
import type {
	ChatCompletionRequest,
	ChatCompletionResponse,
	ChatMessage,
	ModelListResponse,
} from './types';

export { EMPTY_MODEL_REPLY, LlmError, errorMessage, formatChatError, isLikelyToolsUnsupported } from './errors';

/**
 * Thin OpenAI-compatible client using Obsidian `requestUrl` (CORS-safe).
 * Never logs request headers or API keys.
 */
export class LlmClient {
	constructor(private readonly settings: VaultAssistantSettings) {}

	async chat(request: ChatCompletionRequest): Promise<ChatMessage> {
		this.assertReady();
		const config = resolveProviderConfig(this.settings);
		const sampling = completionSampling(
			request.model,
			request.temperature ?? 0,
			request.max_tokens ?? 2048,
		);
		const body: ChatCompletionRequest = {
			model: request.model,
			messages: request.messages,
			...sampling,
		};
		if (request.tools && request.tools.length > 0) {
			body.tools = request.tools;
		}

		const debug = {
			provider: config.id,
			model: request.model,
			endpoint: `${config.apiBaseUrl}/chat/completions`,
			sampling: Object.keys(sampling).join(',') || 'none',
			tools: Boolean(body.tools),
		};

		try {
			const json = await this.postJson(`${config.apiBaseUrl}/chat/completions`, body);
			const parsed = json as ChatCompletionResponse;
			const message = parsed.choices?.[0]?.message;
			if (!message) {
				throw new LlmError(apiErrorMessage(parsed) || EMPTY_MODEL_REPLY, undefined, debug);
			}
			return message;
		} catch (error) {
			if (error instanceof LlmError) {
				throw new LlmError(error.message, error.status, { ...debug, ...error.debug });
			}
			throw error;
		}
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
		const excerpt = text.trim() ? sanitizeErrorText(text.trim().slice(0, 800)) : '';
		throw new LlmError(apiErrorMessage(json) || excerpt || `Provider request failed (${status}).`, status, {
			httpStatus: status,
			body: excerpt,
		});
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
	if (typeof json.error === 'string' && json.error.trim()) {
		return sanitizeErrorText(json.error);
	}
	if (isRecord(json.error)) {
		if (typeof json.error.message === 'string' && json.error.message.trim()) {
			return sanitizeErrorText(json.error.message);
		}
		try {
			return sanitizeErrorText(JSON.stringify(json.error));
		} catch {
			return undefined;
		}
	}
	if (typeof json.message === 'string' && json.message.trim()) {
		return sanitizeErrorText(json.message);
	}
	return undefined;
}
