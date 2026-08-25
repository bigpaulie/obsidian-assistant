import { describe, expect, it } from 'vitest';
import { fallbackTitle, sanitizeTitle } from '../../src/chat/title';
import { CHAT_TITLE_MAX_CHARS } from '../../src/constants';

describe('conversation titles', () => {
	it('sanitizes quotes, newlines, and length', () => {
		expect(sanitizeTitle('  "Hello world"  ')).toBe('Hello world');
		expect(sanitizeTitle('Line one\nLine two')).toBe('Line one Line two');
		expect(sanitizeTitle('')).toBe('');
		const long = 'x'.repeat(CHAT_TITLE_MAX_CHARS + 20);
		expect(sanitizeTitle(long)).toHaveLength(CHAT_TITLE_MAX_CHARS);
	});

	it('falls back to the first user line', () => {
		expect(fallbackTitle('Plan my trip\nmore detail')).toBe('Plan my trip');
		expect(fallbackTitle('   ')).toBe('New chat');
		expect(fallbackTitle('"Quoted"')).toBe('Quoted');
	});
});
