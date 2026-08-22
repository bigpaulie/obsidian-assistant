import { isRecord } from '../utils';

export class LlmError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly debug?: Record<string, string | number | boolean | undefined>,
	) {
		super(message);
		this.name = 'LlmError';
	}
}

export const EMPTY_MODEL_REPLY = 'The model returned an empty reply. Try raising max tokens.';

export function sanitizeErrorText(message: string): string {
	return message
		.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
		.replace(/sk-[a-zA-Z0-9-_]+/g, '[redacted]')
		.replace(/\b[a-zA-Z0-9_-]{40,}\b/g, '[redacted]');
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return sanitizeErrorText(error.message);
	}
	if (typeof error === 'string' && error.trim()) {
		return sanitizeErrorText(error);
	}
	return 'Something went wrong.';
}

export function formatChatError(error: unknown): { summary: string; detail?: string } {
	const raw = errorMessage(error);
	const status = error instanceof LlmError ? error.status : undefined;
	const lower = raw.toLowerCase();
	if (
		status === 401 ||
		lower.includes('invalid api key') ||
		lower.includes('incorrect api key') ||
		lower.includes('unauthorized')
	) {
		return { summary: 'Check the API key in Vault Assistant settings.', detail: raw };
	}
	if (status === 429 || lower.includes('rate limit') || lower.includes('insufficient_quota')) {
		return { summary: 'The provider hit a rate limit or quota.', detail: raw };
	}
	if (lower.includes('max_tokens') || lower.includes('max_completion_tokens')) {
		return { summary: 'This model needs the newer max completion tokens parameter.', detail: raw };
	}
	if (lower.includes('temperature') && lower.includes('support')) {
		return { summary: 'This model does not accept a temperature setting.', detail: raw };
	}
	if (
		lower.includes('model') &&
		(lower.includes('not found') || lower.includes('does not exist') || lower.includes('invalid model'))
	) {
		return {
			summary: 'This model id is not available on the selected provider.',
			detail: raw,
		};
	}
	if (lower.includes('empty reply') || lower.includes('empty response')) {
		return { summary: EMPTY_MODEL_REPLY };
	}
	return { summary: raw.trim() || 'Something went wrong.' };
}

export function isLikelyToolsUnsupported(error: unknown): boolean {
	const message = errorMessage(error).toLowerCase();
	if (
		message.includes('max_tokens') ||
		message.includes('max_completion_tokens') ||
		message.includes('temperature')
	) {
		return false;
	}
	return (
		message.includes('tool') ||
		message.includes('function calling') ||
		message.includes('functions')
	);
}

export function apiErrorMessage(json: unknown): string | undefined {
	if (!isRecord(json)) {
		return undefined;
	}
	if (typeof json.error === 'string' && json.error.trim()) {
		return sanitizeErrorText(json.error);
	}
	if (isRecord(json.error)) {
		if (typeof json.error.message === 'string' && json.error.message.trim()) {
			return sanitizeErrorText(json.error.message);
		}
		try {
			return sanitizeErrorText(JSON.stringify(json.error));
		} catch {
			return undefined;
		}
	}
	if (typeof json.message === 'string' && json.message.trim()) {
		return sanitizeErrorText(json.message);
	}
	return undefined;
}
