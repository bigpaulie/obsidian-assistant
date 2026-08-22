import { asString, isRecord } from '../utils';

const THINK_OPEN = /<think>/i;
const THINK_CLOSE = /<\/think>/i;

/** Pull displayable reasoning from Chat Completions-style message/delta fields. */
export function extractReasoningFields(source: unknown): string {
	if (!isRecord(source)) {
		return '';
	}
	const parts = [source.reasoning, source.reasoning_content, source.thinking]
		.map((value) => asString(value) ?? '')
		.filter((value) => value.length > 0);
	return parts.join('\n');
}

/** Collect `.text` from a string, a `{ text }` record, or an array of those. */
export function extractTextParts(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((part) => extractTextParts(part)).join('');
	}
	if (isRecord(value) && typeof value.text === 'string') {
		return value.text;
	}
	return '';
}

/** Displayable summary from a Responses `reasoning` item (not encrypted blobs). */
export function extractReasoningSummary(item: Record<string, unknown>): string {
	const fromSummary = extractTextParts(item.summary).trim();
	if (fromSummary) {
		return fromSummary;
	}
	return extractTextParts(item.content).trim();
}

export function messageContentToString(content: unknown): string | null {
	if (content === null || content === undefined) {
		return null;
	}
	if (typeof content === 'string') {
		return content;
	}
	const text = extractTextParts(content);
	return text;
}

/**
 * Split R1-style `<think>` tags out of assistant content.
 * An unclosed `<think>` (truncated reply) stays in the thinking channel.
 */
export function splitThinkTags(raw: string): { thinking: string; content: string } {
	const thinkingParts: string[] = [];
	const contentParts: string[] = [];
	let rest = raw;

	while (rest.length > 0) {
		const open = rest.search(THINK_OPEN);
		if (open < 0) {
			contentParts.push(rest);
			break;
		}
		if (open > 0) {
			contentParts.push(rest.slice(0, open));
		}
		const afterOpen = rest.slice(open);
		const openMatch = afterOpen.match(THINK_OPEN);
		const openLength = openMatch?.[0].length ?? 7;
		rest = afterOpen.slice(openLength);
		const close = rest.search(THINK_CLOSE);
		if (close < 0) {
			thinkingParts.push(rest);
			break;
		}
		thinkingParts.push(rest.slice(0, close));
		const afterClose = rest.slice(close);
		const closeMatch = afterClose.match(THINK_CLOSE);
		const closeLength = closeMatch?.[0].length ?? 8;
		rest = afterClose.slice(closeLength);
	}

	return {
		thinking: thinkingParts.join('\n'),
		content: contentParts.join(''),
	};
}

/** Combine thinking channels. Empty parts are dropped. */
export function joinThinking(...parts: Array<string | undefined | null>): string {
	return parts
		.map((part) => part?.trim() ?? '')
		.filter((part) => part.length > 0)
		.join('\n');
}

export function canonicalizeAssistantContent(raw: unknown): { content: string | null; thinking: string } {
	const fieldThinking = extractReasoningFields(raw);
	const record = isRecord(raw) ? raw : undefined;
	const rawContent = record ? messageContentToString(record.content) : null;
	const split = splitThinkTags(rawContent ?? '');
	return {
		thinking: joinThinking(fieldThinking, split.thinking),
		content: rawContent === null && !split.content && !split.thinking ? null : split.content,
	};
}
