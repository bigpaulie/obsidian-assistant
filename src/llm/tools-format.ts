import type { ChatTool, ResponsesTool, ToolSpec } from './types';

/** Nested Chat Completions tools (OpenAI classic, OpenRouter, Ollama /v1). */
export function toChatCompletionsTools(specs: ToolSpec[]): ChatTool[] {
	return specs.map((spec) => ({
		type: 'function',
		function: {
			name: spec.name,
			description: spec.description,
			parameters: spec.parameters,
		},
	}));
}

/** Flat Responses API tools (OpenAI /v1/responses). */
export function toResponsesTools(specs: ToolSpec[]): ResponsesTool[] {
	return specs.map((spec) => ({
		type: 'function',
		name: spec.name,
		description: spec.description,
		parameters: spec.parameters,
	}));
}
