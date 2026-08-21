import { describe, expect, it } from 'vitest';
import {
	EMPTY_MODEL_REPLY,
	LlmError,
	errorMessage,
	formatChatError,
	isLikelyToolsUnsupported,
	sanitizeErrorText,
} from '../../src/llm/errors';

describe('sanitizeErrorText', () => {
	it('redacts bearer tokens, sk- keys, and long tokens', () => {
		const raw = 'Bearer sk-live-secret Authorization sk-abcdefghijklmnopqrstuvwxyz0123456789 and abcdefghijklmnopqrstuvwxyz0123456789abcd';
		const sanitized = sanitizeErrorText(raw);
		expect(sanitized).not.toMatch(/sk-[a-zA-Z0-9]/);
		expect(sanitized).toContain('Bearer [redacted]');
		expect(sanitized).toContain('[redacted]');
		expect(sanitized).not.toContain('sk-live-secret');
	});
});

describe('errorMessage', () => {
	it('sanitizes Error messages and falls back for unknown values', () => {
		expect(errorMessage(new Error('Bearer secret-token-value'))).toContain('[redacted]');
		expect(errorMessage('plain')).toBe('plain');
		expect(errorMessage(null)).toBe('Something went wrong.');
	});
});

describe('formatChatError', () => {
	it('maps status and keywords to stable summaries', () => {
		expect(formatChatError(new LlmError('unauthorized', 401)).summary).toContain('API key');
		expect(formatChatError(new LlmError('rate limit', 429)).summary).toContain('rate limit');
		expect(formatChatError(new Error('max_completion_tokens is required')).summary).toContain(
			'max completion tokens',
		);
		expect(formatChatError(new Error('temperature is not supported')).summary).toContain('temperature');
		expect(formatChatError(new Error('model does not exist')).summary).toContain('model id');
		expect(formatChatError(new Error('empty reply from model')).summary).toBe(EMPTY_MODEL_REPLY);
		expect(formatChatError(new Error('boom')).summary).toBe('boom');
	});
});

describe('isLikelyToolsUnsupported', () => {
	it('detects tool/function errors but not sampling-parameter errors', () => {
		expect(isLikelyToolsUnsupported(new Error('tools are not supported'))).toBe(true);
		expect(isLikelyToolsUnsupported(new Error('function calling disabled'))).toBe(true);
		expect(isLikelyToolsUnsupported(new Error('max_tokens is too large'))).toBe(false);
		expect(isLikelyToolsUnsupported(new Error('temperature is not supported'))).toBe(false);
	});
});
