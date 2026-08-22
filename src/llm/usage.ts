import { asFiniteNumber, isRecord } from '../utils';

export interface TokenUsage {
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	reasoningTokens?: number;
}

export function parseUsage(json: unknown): TokenUsage | undefined {
	if (!isRecord(json)) {
		return undefined;
	}
	const source = isRecord(json.usage) ? json.usage : json;
	const promptTokens = asFiniteNumber(source.prompt_tokens) ?? asFiniteNumber(source.input_tokens);
	const completionTokens = asFiniteNumber(source.completion_tokens) ?? asFiniteNumber(source.output_tokens);
	const totalTokens = asFiniteNumber(source.total_tokens);
	const reasoningTokens =
		detailsCount(source.completion_tokens_details, 'reasoning_tokens') ??
		detailsCount(source.output_tokens_details, 'reasoning_tokens');
	const usage: TokenUsage = {};
	if (promptTokens !== undefined) {
		usage.promptTokens = promptTokens;
	}
	if (completionTokens !== undefined) {
		usage.completionTokens = completionTokens;
	}
	if (totalTokens !== undefined) {
		usage.totalTokens = totalTokens;
	} else if (promptTokens !== undefined || completionTokens !== undefined) {
		usage.totalTokens = (promptTokens ?? 0) + (completionTokens ?? 0);
	}
	if (reasoningTokens !== undefined) {
		usage.reasoningTokens = reasoningTokens;
	}
	return hasAnyCount(usage) ? usage : undefined;
}

export function sumUsage(parts: Array<TokenUsage | undefined>): TokenUsage | undefined {
	const defined = parts.filter((part): part is TokenUsage => part !== undefined && hasAnyCount(part));
	if (defined.length === 0) {
		return undefined;
	}
	const usage: TokenUsage = {};
	for (const part of defined) {
		addCount(usage, 'promptTokens', part.promptTokens);
		addCount(usage, 'completionTokens', part.completionTokens);
		addCount(usage, 'totalTokens', part.totalTokens);
		addCount(usage, 'reasoningTokens', part.reasoningTokens);
	}
	return usage;
}

export function formatReplyMeta(model: string, usage?: TokenUsage): string {
	const name = model.trim();
	if (!name && !hasAnyCount(usage)) {
		return '';
	}
	const label = name || 'model';
	if (!hasAnyCount(usage) || !usage) {
		return label;
	}
	const prompt = usage.promptTokens;
	const completion = usage.completionTokens;
	const total = usage.totalTokens;
	let line: string;
	if (prompt !== undefined && completion !== undefined) {
		line = `${label} · ${formatCount(prompt)} → ${formatCount(completion)} tokens`;
	} else if (total !== undefined) {
		line = `${label} · ${formatCount(total)} tokens`;
	} else if (completion !== undefined) {
		line = `${label} · ${formatCount(completion)} tokens`;
	} else if (prompt !== undefined) {
		line = `${label} · ${formatCount(prompt)} tokens`;
	} else {
		line = label;
	}
	if (usage.reasoningTokens) {
		line += ` (${formatCount(usage.reasoningTokens)} thinking)`;
	}
	return line;
}

function hasAnyCount(usage?: TokenUsage): boolean {
	if (!usage) {
		return false;
	}
	return (
		usage.promptTokens !== undefined ||
		usage.completionTokens !== undefined ||
		usage.totalTokens !== undefined ||
		usage.reasoningTokens !== undefined
	);
}

function addCount(target: TokenUsage, key: keyof TokenUsage, value?: number): void {
	if (value === undefined) {
		return;
	}
	target[key] = (target[key] ?? 0) + value;
}

function detailsCount(details: unknown, key: string): number | undefined {
	if (!isRecord(details)) {
		return undefined;
	}
	return asFiniteNumber(details[key]);
}

function formatCount(value: number): string {
	return value.toLocaleString('en-US');
}
