import type { ProviderId } from '../settings';
import type { ChatMessage } from './types';

export interface CompletionSampling {
	temperature?: number;
	max_tokens?: number;
	max_completion_tokens?: number;
}

/** Chat Completions sampling fields that this model family accepts. */
export function completionSampling(
	model: string,
	temperature: number,
	maxTokens: number,
): CompletionSampling {
	const id = canonicalModelId(model);
	if (isLegacyMaxTokensModel(id)) {
		return { temperature, max_tokens: maxTokens };
	}
	if (isGpt41Family(id)) {
		return { temperature, max_completion_tokens: maxTokens };
	}
	return { max_completion_tokens: maxTokens };
}

/**
 * OpenAI gpt-5.4+ (including gpt-5.6-sol) needs /v1/responses for function tools.
 * Stay on Responses for follow-up turns that already contain tool items.
 */
export function usesResponsesApi(
	provider: ProviderId,
	model: string,
	options: { hasTools: boolean; messages: ChatMessage[] },
): boolean {
	if (provider !== 'openai') {
		return false;
	}
	if (!isDottedGpt54Plus(canonicalModelId(model))) {
		return false;
	}
	if (options.hasTools) {
		return true;
	}
	return options.messages.some(hasResponsesHistory);
}

/**
 * Chat Completions workaround for gpt-5.4+ on OpenRouter: tools 400 unless effort is none.
 */
export function chatCompletionsReasoningEffort(
	provider: ProviderId,
	model: string,
	hasTools: boolean,
): 'none' | undefined {
	if (provider !== 'openrouter' || !hasTools) {
		return undefined;
	}
	if (isDottedGpt54Plus(canonicalModelId(model))) {
		return 'none';
	}
	return undefined;
}

function hasResponsesHistory(message: ChatMessage): boolean {
	return (
		message.role === 'tool' ||
		Boolean(message.tool_calls?.length) ||
		Boolean(message.providerItems?.length)
	);
}

/** gpt-5.4, gpt-5.5, gpt-5.6, gpt-5.6-sol, dated snapshots. */
function isDottedGpt54Plus(id: string): boolean {
	return /^gpt-5\.(4|5|6)/.test(id);
}

function canonicalModelId(model: string): string {
	const trimmed = model.trim().toLowerCase();
	const slash = trimmed.lastIndexOf('/');
	if (slash >= 0) {
		return trimmed.slice(slash + 1);
	}
	return trimmed;
}

/** gpt-4o, gpt-4-turbo, gpt-3.5, and dated gpt-4-* ids still use max_tokens. */
function isLegacyMaxTokensModel(id: string): boolean {
	if (id.startsWith('gpt-4o')) {
		return true;
	}
	if (id.startsWith('gpt-3.5')) {
		return true;
	}
	if (id === 'gpt-4' || id.startsWith('gpt-4-')) {
		return true;
	}
	return false;
}

function isGpt41Family(id: string): boolean {
	return /^gpt-4\./.test(id);
}
