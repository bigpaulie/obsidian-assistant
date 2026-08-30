import { describe, expect, it } from 'vitest';
import { resolveImageMime } from '../../src/ui/attachments';

describe('resolveImageMime', () => {
	it('uses file.type when supported', () => {
		expect(resolveImageMime({ type: 'image/png', name: 'x.bin' } as File)).toBe('image/png');
	});

	it('falls back to extension when type is empty', () => {
		expect(resolveImageMime({ type: '', name: 'photo.JPG' } as File)).toBe('image/jpeg');
	});

	it('rejects unsupported types', () => {
		expect(resolveImageMime({ type: 'application/pdf', name: 'doc.pdf' } as File)).toBeNull();
		expect(resolveImageMime({ type: '', name: 'photo.heic' } as File)).toBeNull();
	});
});
