import { requestUrl } from 'obsidian';
import { DEFAULT_OLLAMA_URL } from '../constants';
import { debugLog, type DebugPayload } from '../debug';
import type { VaultAssistantSettings } from '../settings';
import { isRecord } from '../utils';
import { EMPTY_MODEL_REPLY, LlmError, errorMessage, sanitizeErrorText } from './errors';
import { chatCompletionsReasoningEffort, completionSampling, usesResponsesApi } from './model-params';
import { getApiKeyForProvider, normalizeServerUrl, resolveProviderConfig } from './providers';
import { messagesToResponsesInput, responsesOutputToMessage, type ResponsesRequest } from './responses';
import { toChatCompletionsTools, toResponsesTools } from './tools-format';
import type {
	ChatCompletionRequest,
	ChatCompletionResponse,
	ChatMessage,
	ChatRequest,
	ModelListResponse,
} from './types';

export { EMPTY_MODEL_REPLY, LlmError, errorMessage, formatChatError, isLikelyToolsUnsupported } from './errors';

export interface ChatResult {
	message: ChatMessage;
	finishReason?: string;
	durationMs: number;
}

/**
 * Thin OpenAI-compatible client using Obsidian `requestUrl` (CORS-safe).
 * Converts canonical tools to Chat Completions or Responses wire format.
 * Never logs request headers or API keys.
 */
export class LlmClient {
	constructor(private readonly settings: VaultAssistantSettings) {}

	async chat(request: ChatRequest): Promise<ChatResult> {
		this.assertReady();
		const config = resolveProviderConfig(this.settings);
		const tools = request.tools ?? [];
		const hasTools = tools.length > 0;
		if (usesResponsesApi(config.id, request.model, { hasTools, messages: request.messages })) {
			return this.chatResponses(request, hasTools ? tools : undefined);
		}
		return this.chatCompletions(request);
	}

	private async chatCompletions(request: ChatRequest): Promise<ChatResult> {
		const config = resolveProviderConfig(this.settings);
		const sampling = completionSampling(
			request.model,
			request.temperature ?? 0,
			request.max_tokens ?? 2048,
		);
		const body: ChatCompletionRequest = {
			model: request.model,
			messages: stripProviderItems(request.messages),
			...sampling,
		};
		if (request.tools && request.tools.length > 0) {
			body.tools = toChatCompletionsTools(request.tools);
			const effort = chatCompletionsReasoningEffort(config.id, request.model, true);
			if (effort) {
				body.reasoning_effort = effort;
			}
		}

		const endpoint = `${config.apiBaseUrl}/chat/completions`;
		const debug = {
			provider: config.id,
			model: request.model,
			endpoint,
			sampling: Object.keys(sampling).join(',') || 'none',
			tools: Boolean(body.tools),
		};
		const startedAt = Date.now();
		debugLog(this.settings, 'chat.start', debug);

		try {
			const { json, status } = await this.postJson(endpoint, body);
			const durationMs = Date.now() - startedAt;
			const parsed = json as ChatCompletionResponse;
			const choice = parsed.choices?.[0];
			const message = choice?.message;
			const meta = {
				...debug,
				httpStatus: status,
				durationMs,
				finishReason: choice?.finish_reason,
				contentLength: message?.content?.length ?? 0,
				toolCallCount: message?.tool_calls?.length ?? 0,
			};
			if (!message) {
				throw new LlmError(apiErrorMessage(parsed) || EMPTY_MODEL_REPLY, undefined, meta);
			}
			debugLog(this.settings, 'chat.ok', meta);
			return { message, finishReason: choice?.finish_reason, durationMs };
		} catch (error) {
			throw this.wrapError(error, debug, startedAt);
		}
	}

	private async chatResponses(request: ChatRequest, tools?: ChatRequest['tools']): Promise<ChatResult> {
		const config = resolveProviderConfig(this.settings);
		const { instructions, input } = messagesToResponsesInput(request.messages);
		const body: ResponsesRequest = {
			model: request.model,
			input,
			store: false,
			max_output_tokens: request.max_tokens ?? 2048,
		};
		if (instructions) {
			body.instructions = instructions;
		}
		if (tools && tools.length > 0) {
			body.tools = toResponsesTools(tools);
		}

		const endpoint = `${config.apiBaseUrl}/responses`;
		const debug = {
			provider: config.id,
			model: request.model,
			endpoint,
			sampling: 'max_output_tokens',
			tools: Boolean(body.tools),
		};
		const startedAt = Date.now();
		debugLog(this.settings, 'chat.start', debug);

		try {
			const { json, status } = await this.postJson(endpoint, body);
			const durationMs = Date.now() - startedAt;
			const parsed = json as { output?: unknown[]; status?: string; error?: { message?: string } };
			const { message, finishReason } = responsesOutputToMessage(parsed.output, parsed.status);
			const meta = {
				...debug,
				httpStatus: status,
				durationMs,
				finishReason,
				contentLength: message.content?.length ?? 0,
				toolCallCount: message.tool_calls?.length ?? 0,
			};
			if (!message.content && !message.tool_calls?.length) {
				throw new LlmError(apiErrorMessage(parsed) || EMPTY_MODEL_REPLY, undefined, meta);
			}
			debugLog(this.settings, 'chat.ok', meta);
			return { message, finishReason, durationMs };
		} catch (error) {
			throw this.wrapError(error, debug, startedAt);
		}
	}

	async listModels(): Promise<string[]> {
		this.assertReady();
		const config = resolveProviderConfig(this.settings);
		const endpoint = `${config.apiBaseUrl}/models`;
		const debug = { provider: config.id, endpoint };
		const startedAt = Date.now();
		debugLog(this.settings, 'models.start', debug);
		try {
			const { json, status } = await this.getJson(endpoint);
			const durationMs = Date.now() - startedAt;
			const parsed = json as ModelListResponse;
			const ids = (parsed.data ?? [])
				.map((item) => item.id)
				.filter((id): id is string => typeof id === 'string' && id.length > 0);
			const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
			debugLog(this.settings, 'models.ok', {
				...debug,
				httpStatus: status,
				durationMs,
				modelCount: unique.length,
			});
			return unique;
		} catch (error) {
			throw this.wrapError(error, debug, startedAt);
		}
	}

	async testConnection(): Promise<{ ok: true; modelCount: number } | { ok: false; message: string }> {
		try {
			const models = await this.listModels();
			return { ok: true, modelCount: models.length };
		} catch (error) {
			return { ok: false, message: errorMessage(error) };
		}
	}

	private wrapError(error: unknown, debug: DebugPayload, startedAt: number): LlmError {
		const durationMs = Date.now() - startedAt;
		const wrapped =
			error instanceof LlmError
				? new LlmError(error.message, error.status, { ...debug, ...error.debug, durationMs })
				: new LlmError(errorMessage(error), undefined, { ...debug, durationMs });
		debugLog(this.settings, 'request.error', {
			error: wrapped.message,
			status: wrapped.status,
			...wrapped.debug,
		});
		return wrapped;
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

	private async postJson(url: string, body: unknown): Promise<{ json: unknown; status: number }> {
		const config = resolveProviderConfig(this.settings);
		const response = await requestUrl({
			url,
			method: 'POST',
			headers: config.headers,
			body: JSON.stringify(body),
			throw: false,
		});
		return { json: parseResponse(response.status, response.text), status: response.status };
	}

	private async getJson(url: string): Promise<{ json: unknown; status: number }> {
		const config = resolveProviderConfig(this.settings);
		const response = await requestUrl({
			url,
			method: 'GET',
			headers: config.headers,
			throw: false,
		});
		return { json: parseResponse(response.status, response.text), status: response.status };
	}
}

function stripProviderItems(messages: ChatMessage[]): ChatMessage[] {
	return messages.map((message) => {
		const copy = { ...message };
		delete copy.providerItems;
		return copy;
	});
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
		throw new LlmError('Provider returned a non-JSON response.', status, { httpStatus: status });
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
