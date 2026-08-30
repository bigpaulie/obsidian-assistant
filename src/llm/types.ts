export interface ChatToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface TextContentPart {
	type: 'text';
	text: string;
}

export interface ImageContentPart {
	type: 'image_url';
	image_url: {
		url: string;
		detail?: 'auto' | 'low' | 'high';
	};
}

export type ContentPart = TextContentPart | ImageContentPart;

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | ContentPart[] | null;
	tool_calls?: ChatToolCall[];
	tool_call_id?: string;
	/** Responses API items to echo on the next turn (reasoning + function_call). */
	providerItems?: Record<string, unknown>[];
}

/** Provider-agnostic function tool. Convert with tools-format before sending. */
export interface ToolSpec {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface ChatTool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface ResponsesTool {
	type: 'function';
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface ChatRequest {
	model: string;
	messages: ChatMessage[];
	tools?: ToolSpec[];
	temperature?: number;
	max_tokens?: number;
}

export interface ChatCompletionRequest {
	model: string;
	messages: ChatMessage[];
	tools?: ChatTool[];
	temperature?: number;
	max_tokens?: number;
	max_completion_tokens?: number;
	reasoning_effort?: 'none';
}

export interface ChatCompletionChoice {
	message: ChatMessage;
	finish_reason?: string;
}

export interface ChatCompletionResponse {
	choices?: ChatCompletionChoice[];
	usage?: unknown;
	error?: { message?: string; type?: string };
}

export interface ModelListResponse {
	data?: Array<{ id?: string }>;
}
