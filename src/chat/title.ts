import { CHAT_TITLE_MAX_CHARS } from '../constants';
import { LlmClient } from '../llm/client';
import type { VaultAssistantSettings } from '../settings';
import { truncate } from '../utils';

const TITLE_SYSTEM_PROMPT =
	'Reply with a short conversation title only: 3 to 6 words, no quotes, no punctuation at the ends, no explanation.';

/** Strip quotes/newlines and cap length for display and storage. */
export function sanitizeTitle(raw: string): string {
	const cleaned = raw
		.trim()
		.replace(/^["'`]+|["'`]+$/g, '')
		.replace(/[\r\n]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!cleaned) {
		return '';
	}
	if (cleaned.length <= CHAT_TITLE_MAX_CHARS) {
		return cleaned;
	}
	return cleaned.slice(0, CHAT_TITLE_MAX_CHARS).trimEnd();
}

/** Fallback title from the first user message when the LLM call fails. */
export function fallbackTitle(userMessage: string): string {
	const line = userMessage.trim().split(/\r?\n/)[0]?.trim() ?? '';
	const sanitized = sanitizeTitle(line);
	if (sanitized) {
		return sanitized;
	}
	return 'New chat';
}

/**
 * Ask the configured model for a short title. Falls back to the user message on failure.
 */
export async function generateConversationTitle(
	settings: VaultAssistantSettings,
	userMessage: string,
	assistantSnippet?: string,
): Promise<string> {
	const fallback = fallbackTitle(userMessage);
	try {
		const client = new LlmClient(settings);
		const userParts = [`User: ${truncate(userMessage.trim(), 400)}`];
		const snippet = assistantSnippet?.trim();
		if (snippet) {
			userParts.push(`Assistant: ${truncate(snippet, 200)}`);
		}
		const result = await client.chat({
			model: settings.model,
			temperature: 0.2,
			max_tokens: 32,
			messages: [
				{ role: 'system', content: TITLE_SYSTEM_PROMPT },
				{ role: 'user', content: userParts.join('\n') },
			],
		});
		const content = typeof result.message.content === 'string' ? result.message.content : '';
		const titled = sanitizeTitle(content);
		return titled || fallback;
	} catch {
		return fallback;
	}
}
