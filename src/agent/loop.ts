import { MAX_TOOL_ROUNDS } from '../constants';
import { debugLog, type DebugPayload } from '../debug';
import {
	EMPTY_MODEL_REPLY,
	LlmClient,
	LlmError,
	errorMessage,
	isLikelyToolsUnsupported,
	type ChatResult,
} from '../llm/client';
import type { ChatMessage, ChatToolCall } from '../llm/types';
import { sumUsage, type TokenUsage } from '../llm/usage';
import type VaultAssistantPlugin from '../main';
import { retrieveContext } from '../rag/retriever';
import { getActiveMarkdownPath } from '../vault/notes';
import { collectReferencedFiles, loadReferencedNotes } from '../vault/references';
import { loadSystemNoteExtra } from '../vault/system-note';
import { buildSystemPrompt } from './prompt';
import { executeTool, getToolDefinitions, type NoteProposal } from './tools';

export interface AgentRunOptions {
	history: ChatMessage[];
	userMessage: string;
	referencedPaths?: string[];
	cancelled: () => boolean;
	onStatus?: (text: string) => void;
}

export interface AgentRunResult {
	assistantText: string;
	thinking?: string;
	proposals: NoteProposal[];
	messages: ChatMessage[];
	debug: DebugPayload;
	usage?: TokenUsage;
	model: string;
	systemNotePath: string | null;
}

interface AgentTrace {
	startedAt: number;
	ragHits: number;
	rounds: number;
	tools: string[];
	fallback: boolean;
	finishReason?: string;
	thinking?: string;
	usage?: TokenUsage;
	model: string;
	systemNotePath: string | null;
}

/**
 * Chat loop with API tools (converted per provider).
 * Falls back to a single RAG-stuffed completion when the model rejects tools.
 */
export async function runAgent(
	plugin: VaultAssistantPlugin,
	options: AgentRunOptions,
): Promise<AgentRunResult> {
	const client = new LlmClient(plugin.settings);
	const activeNotePath = getActiveMarkdownPath(plugin.app);
	const systemNote = await loadSystemNoteExtra(plugin.app, activeNotePath);
	const referencedFiles = collectReferencedFiles(
		plugin.app,
		options.referencedPaths ?? [],
		options.userMessage,
		activeNotePath ?? '',
		plugin.settings.excludeFolders,
	);
	const referencedNotes = await loadReferencedNotes(plugin.app, referencedFiles);
	const ragHits =
		plugin.settings.ragEnabled && options.userMessage.trim()
			? retrieveContext(plugin.indexer, options.userMessage, plugin.settings.maxChunks)
			: [];
	const system = buildSystemPrompt({
		userPrompt: systemNote?.content ?? plugin.settings.systemPrompt,
		systemNotePath: systemNote?.path ?? null,
		activeNotePath,
		ragHits,
		referencedNotes,
	});

	const messages: ChatMessage[] = [
		{ role: 'system', content: system },
		...options.history,
		{ role: 'user', content: options.userMessage },
	];

	const tools = getToolDefinitions(plugin.settings.ragEnabled);
	const proposals: NoteProposal[] = [];
	const trace: AgentTrace = {
		startedAt: Date.now(),
		ragHits: ragHits.length,
		rounds: 0,
		tools: [],
		fallback: false,
		model: plugin.settings.model.trim(),
		systemNotePath: systemNote?.path ?? null,
	};

	try {
		return await runWithTools(plugin, client, messages, tools, proposals, options, trace);
	} catch (error) {
		if (options.cancelled()) {
			return stopped(messages, proposals, trace);
		}
		if (!isLikelyToolsUnsupported(error)) {
			throw error;
		}
		trace.fallback = true;
		debugLog(plugin.settings, 'agent.toolsUnsupported', {
			error: errorMessage(error),
			status: error instanceof LlmError ? error.status : undefined,
		});
		setStatus(plugin, options, 'Provider rejected tools; answering without tools.');
		return runWithoutTools(client, messages, plugin, options, trace);
	}
}

async function runWithTools(
	plugin: VaultAssistantPlugin,
	client: LlmClient,
	messages: ChatMessage[],
	tools: ReturnType<typeof getToolDefinitions>,
	proposals: NoteProposal[],
	options: AgentRunOptions,
	trace: AgentTrace,
): Promise<AgentRunResult> {
	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		if (options.cancelled()) {
			return stopped(messages, proposals, trace);
		}
		trace.rounds = round + 1;
		setStatus(plugin, options, `Requesting model (round ${round + 1}, tools)…`);
		const result = await chatTurn(client, plugin, messages, tools);
		rememberTurn(trace, result);
		if (options.cancelled()) {
			return stopped(messages, proposals, trace);
		}

		const message = result.message;
		const toolCalls = message.tool_calls?.filter((call) => call.function?.name);
		if (!toolCalls || toolCalls.length === 0) {
			trace.thinking = result.thinking;
			const text = message.content?.trim() || EMPTY_MODEL_REPLY;
			messages.push({ role: 'assistant', content: text });
			return finished(text, proposals, messages, trace);
		}

		messages.push({
			role: 'assistant',
			content: message.content ?? '',
			tool_calls: toolCalls,
			providerItems: message.providerItems,
		});

		for (const call of toolCalls) {
			if (options.cancelled()) {
				return stopped(messages, proposals, trace);
			}
			const name = call.function.name;
			trace.tools.push(name);
			setStatus(plugin, options, `Running ${name}…`);
			debugLog(plugin.settings, 'agent.tool', { name, round: round + 1 });
			const outcome = await executeTool(plugin, name, parseArgs(call, plugin));
			if (outcome.type === 'proposal') {
				proposals.push(outcome.proposal);
			}
			messages.push({
				role: 'tool',
				tool_call_id: call.id,
				content: outcome.text,
			});
		}
	}

	setStatus(plugin, options, 'Requesting model (tool limit, no tools)…');
	const final = await chatTurn(client, plugin, messages);
	rememberTurn(trace, final);
	trace.thinking = final.thinking;
	trace.finishReason = final.finishReason;
	const text = final.message.content?.trim() || 'Reached the tool-call limit.';
	messages.push({ role: 'assistant', content: text });
	return finished(text, proposals, messages, trace);
}

async function runWithoutTools(
	client: LlmClient,
	messages: ChatMessage[],
	plugin: VaultAssistantPlugin,
	options: AgentRunOptions,
	trace: AgentTrace,
): Promise<AgentRunResult> {
	if (options.cancelled()) {
		return stopped(messages, [], trace);
	}
	setStatus(plugin, options, 'Requesting model (no tools)…');
	const result = await chatTurn(client, plugin, messages);
	rememberTurn(trace, result);
	trace.thinking = result.thinking;
	trace.rounds = Math.max(trace.rounds, 1);
	const text = result.message.content?.trim() || EMPTY_MODEL_REPLY;
	messages.push({ role: 'assistant', content: text });
	return finished(text, [], messages, trace);
}

async function chatTurn(
	client: LlmClient,
	plugin: VaultAssistantPlugin,
	messages: ChatMessage[],
	tools?: ReturnType<typeof getToolDefinitions>,
): Promise<ChatResult> {
	return client.chat({
		model: plugin.settings.model.trim(),
		messages,
		tools,
		temperature: plugin.settings.temperature,
		max_tokens: plugin.settings.maxTokens,
	});
}

function rememberTurn(trace: AgentTrace, result: ChatResult): void {
	trace.finishReason = result.finishReason;
	trace.usage = sumUsage([trace.usage, result.usage]);
}

function parseArgs(call: ChatToolCall, plugin: VaultAssistantPlugin): unknown {
	const raw = call.function.arguments?.trim();
	if (!raw) {
		return {};
	}
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		debugLog(plugin.settings, 'tool.args.invalid', {
			name: call.function.name,
			argumentLength: raw.length,
		});
		return {};
	}
}

function setStatus(plugin: VaultAssistantPlugin, options: AgentRunOptions, text: string): void {
	if (!plugin.settings.debugMode) {
		return;
	}
	options.onStatus?.(text);
}

function stopped(messages: ChatMessage[], proposals: NoteProposal[], trace: AgentTrace): AgentRunResult {
	return finished('Stopped.', proposals, messages, trace);
}

function finished(
	assistantText: string,
	proposals: NoteProposal[],
	messages: ChatMessage[],
	trace: AgentTrace,
): AgentRunResult {
	return {
		assistantText,
		thinking: trace.thinking,
		proposals,
		messages,
		usage: trace.usage,
		model: trace.model,
		systemNotePath: trace.systemNotePath,
		debug: {
			durationMs: Date.now() - trace.startedAt,
			rounds: trace.rounds,
			tools: trace.tools.join(', ') || 'none',
			ragHits: trace.ragHits,
			fallback: trace.fallback,
			finishReason: trace.finishReason,
			promptTokens: trace.usage?.promptTokens,
			completionTokens: trace.usage?.completionTokens,
			totalTokens: trace.usage?.totalTokens,
			systemNotePath: trace.systemNotePath ?? undefined,
		},
	};
}

export { errorMessage };
