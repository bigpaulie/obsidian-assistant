import { MAX_TOOL_ROUNDS } from '../constants';
import { LlmClient, errorMessage, isLikelyToolsUnsupported } from '../llm/client';
import type { ChatMessage, ChatToolCall } from '../llm/types';
import type VaultAssistantPlugin from '../main';
import { retrieveContext } from '../rag/retriever';
import { getActiveMarkdownPath } from '../vault/notes';
import { collectReferencedFiles, loadReferencedNotes } from '../vault/references';
import { buildSystemPrompt } from './prompt';
import { executeTool, getToolDefinitions, type NoteProposal } from './tools';

export interface AgentRunOptions {
	history: ChatMessage[];
	userMessage: string;
	referencedPaths?: string[];
	cancelled: () => boolean;
}

export interface AgentRunResult {
	assistantText: string;
	proposals: NoteProposal[];
	messages: ChatMessage[];
}

/**
 * Chat completions loop with optional tools.
 * Falls back to a single RAG-stuffed completion when the model rejects tools.
 */
export async function runAgent(
	plugin: VaultAssistantPlugin,
	options: AgentRunOptions,
): Promise<AgentRunResult> {
	const client = new LlmClient(plugin.settings);
	const activeNotePath = getActiveMarkdownPath(plugin.app);
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
		userPrompt: plugin.settings.systemPrompt,
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

	try {
		return await runWithTools(plugin, client, messages, tools, proposals, options.cancelled);
	} catch (error) {
		if (!isLikelyToolsUnsupported(error)) {
			throw error;
		}
		return runWithoutTools(client, messages, plugin, options.cancelled);
	}
}

async function runWithTools(
	plugin: VaultAssistantPlugin,
	client: LlmClient,
	messages: ChatMessage[],
	tools: ReturnType<typeof getToolDefinitions>,
	proposals: NoteProposal[],
	cancelled: () => boolean,
): Promise<AgentRunResult> {
	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		if (cancelled()) {
			return { assistantText: 'Stopped.', proposals, messages };
		}
		const message = await client.chat({
			model: plugin.settings.model.trim(),
			messages,
			tools,
			temperature: plugin.settings.temperature,
			max_tokens: plugin.settings.maxTokens,
		});
		if (cancelled()) {
			return { assistantText: 'Stopped.', proposals, messages };
		}

		const toolCalls = message.tool_calls?.filter((call) => call.function?.name);
		if (!toolCalls || toolCalls.length === 0) {
			const text = message.content?.trim() || 'Done.';
			messages.push({ role: 'assistant', content: text });
			return { assistantText: text, proposals, messages };
		}

		messages.push({
			role: 'assistant',
			content: message.content ?? '',
			tool_calls: toolCalls,
		});

		for (const call of toolCalls) {
			if (cancelled()) {
				return { assistantText: 'Stopped.', proposals, messages };
			}
			const outcome = await executeTool(plugin, call.function.name, parseArgs(call));
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

	const final = await client.chat({
		model: plugin.settings.model.trim(),
		messages,
		temperature: plugin.settings.temperature,
		max_tokens: plugin.settings.maxTokens,
	});
	const text = final.content?.trim() || 'Reached the tool-call limit.';
	messages.push({ role: 'assistant', content: text });
	return { assistantText: text, proposals, messages };
}

async function runWithoutTools(
	client: LlmClient,
	messages: ChatMessage[],
	plugin: VaultAssistantPlugin,
	cancelled: () => boolean,
): Promise<AgentRunResult> {
	if (cancelled()) {
		return { assistantText: 'Stopped.', proposals: [], messages };
	}
	const message = await client.chat({
		model: plugin.settings.model.trim(),
		messages,
		temperature: plugin.settings.temperature,
		max_tokens: plugin.settings.maxTokens,
	});
	const text = message.content?.trim() || 'Done.';
	messages.push({ role: 'assistant', content: text });
	return { assistantText: text, proposals: [], messages };
}

function parseArgs(call: ChatToolCall): unknown {
	const raw = call.function.arguments?.trim();
	if (!raw) {
		return {};
	}
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return {};
	}
}

export { errorMessage };
