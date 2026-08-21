import { describe, expect, it } from 'vitest';
import { asString, isRecord, parseFolderList, truncate } from '../src/utils';

describe('truncate', () => {
	it('returns the original string when it fits', () => {
		expect(truncate('hello', 10)).toBe('hello');
	});

	it('appends a truncation marker when over the limit', () => {
		expect(truncate('abcdefghij', 4)).toBe('abcd\n…[truncated]');
	});
});

describe('isRecord', () => {
	it('accepts plain objects', () => {
		expect(isRecord({ a: 1 })).toBe(true);
	});

	it('rejects arrays, null, and primitives', () => {
		expect(isRecord([])).toBe(false);
		expect(isRecord(null)).toBe(false);
		expect(isRecord('x')).toBe(false);
		expect(isRecord(1)).toBe(false);
	});
});

describe('asString', () => {
	it('returns strings and undefined for everything else', () => {
		expect(asString('ok')).toBe('ok');
		expect(asString(1)).toBeUndefined();
		expect(asString(null)).toBeUndefined();
		expect(asString({ text: 'no' })).toBeUndefined();
	});
});

describe('parseFolderList', () => {
	it('skips blank lines and # comments, and accepts CRLF', () => {
		const raw = 'notes\r\n\n# ignore me\narchive/\n  \nTemplates';
		expect(parseFolderList(raw)).toEqual(['notes', 'archive/', 'Templates']);
	});

	it('returns an empty list for whitespace-only input', () => {
		expect(parseFolderList('  \n\r\n')).toEqual([]);
	});
});
