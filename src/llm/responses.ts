import { asString, isRecord } from '../utils';
import { extractReasoningSummary, extractTextParts, joinThinking } from './thinking';
import type { ChatMessage, ChatToolCall } from './types';

export interface ResponsesRequest {
	model: string;
	input: unknown[];
	instructions?: string;
	tools?: unknown[];
	max_output_tokens?: number;
	store: false;
}

export interface ResponsesResponse {
	output?: unknown[];
	status?: string;
	error?: { message?: string };
}

/** Convert Chat Completions-style messages to Responses `instructions` + `input`. */
export function messagesToResponsesInput(messages: ChatMessage[]): {
	instructions?: string;
	input: unknown[];
} {
	const input: unknown[] = [];
	let instructions: string | undefined;

	for (const message of messages) {
		if (message.role === 'system' && instructions === undefined && input.length === 0) {
			instructions = message.content ?? undefined;
			continue;
		}
		if (message.role === 'system') {
			input.push({ type: 'message', role: 'system', content: message.content ?? '' });
			continue;
		}
		if (message.role === 'user') {
			input.push({ type: 'message', role: 'user', content: message.content ?? '' });
			continue;
		}
		if (message.role === 'assistant') {
			if (message.providerItems && message.providerItems.length > 0) {
				input.push(...message.providerItems);
				continue;
			}
			const toolCalls = message.tool_calls?.filter((call) => call.function?.name);
			if (toolCalls && toolCalls.length > 0) {
				for (const call of toolCalls) {
					input.push({
						type: 'function_call',
						call_id: call.id,
						name: call.function.name,
						arguments: call.function.arguments ?? '',
					});
				}
				continue;
			}
			input.push({ type: 'message', role: 'assistant', content: message.content ?? '' });
			continue;
		}
		input.push({
			type: 'function_call_output',
			call_id: message.tool_call_id ?? '',
			output: message.content ?? '',
		});
	}

	return { instructions, input };
}

/** Map Responses `output` items to the ChatMessage + tool_calls the agent loop already uses. */
export function responsesOutputToMessage(
	output: unknown[] | undefined,
	status?: string,
): { message: ChatMessage; finishReason?: string; thinking?: string } {
	const items = output ?? [];
	const providerItems: Record<string, unknown>[] = [];
	const toolCalls: ChatToolCall[] = [];
	const texts: string[] = [];
	const thinkingParts: string[] = [];

	for (const item of items) {
		if (!isRecord(item)) {
			continue;
		}
		if (item.type === 'reasoning' || item.type === 'function_call') {
			providerItems.push(item);
		}
		if (item.type === 'reasoning') {
			const summary = extractReasoningSummary(item);
			if (summary) {
				thinkingParts.push(summary);
			}
		}
		if (item.type === 'function_call') {
			const name = asString(item.name);
			if (!name) {
				continue;
			}
			toolCalls.push({
				id: asString(item.call_id) ?? asString(item.id) ?? '',
				type: 'function',
				function: {
					name,
					arguments: asString(item.arguments) ?? '{}',
				},
			});
		}
		if (item.type === 'message') {
			const text = extractItemText(item);
			if (text) {
				texts.push(text);
			}
		}
	}

	const message: ChatMessage = {
		role: 'assistant',
		content: texts.join('\n').trim() || (toolCalls.length > 0 ? '' : null),
	};
	if (toolCalls.length > 0) {
		message.tool_calls = toolCalls;
	}
	if (providerItems.length > 0) {
		message.providerItems = providerItems;
	}

	let finishReason: string | undefined;
	if (toolCalls.length > 0) {
		finishReason = 'tool_calls';
	} else if (status === 'incomplete') {
		finishReason = 'length';
	} else if (status) {
		finishReason = status;
	}

	const thinking = joinThinking(...thinkingParts);
	if (thinking) {
		return { message, finishReason, thinking };
	}
	return { message, finishReason };
}

function extractItemText(item: Record<string, unknown>): string {
	return extractTextParts(item.content);
}
