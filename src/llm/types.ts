export interface ChatToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: ChatToolCall[];
	tool_call_id?: string;
}

export interface ChatTool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface ChatCompletionRequest {
	model: string;
	messages: ChatMessage[];
	tools?: ChatTool[];
	temperature?: number;
	max_tokens?: number;
	max_completion_tokens?: number;
}

export interface ChatCompletionChoice {
	message: ChatMessage;
	finish_reason?: string;
}

export interface ChatCompletionResponse {
	choices?: ChatCompletionChoice[];
	error?: { message?: string; type?: string };
}

export interface ModelListResponse {
	data?: Array<{ id?: string }>;
}
