import { describe, expect, it, vi } from 'vitest';
import {
	loadSystemNoteExtra,
	resolveSystemNotePath,
} from '../../src/vault/system-note';

function vaultApp(paths: string[], contents: Record<string, string> = {}) {
	const files = Object.fromEntries(paths.map((path) => [path, { path, extension: 'md' }]));
	return {
		vault: {
			getFileByPath: (path: string) => files[path] ?? null,
			cachedRead: vi.fn(async (file: { path: string }) => contents[file.path] ?? ''),
		},
	};
}

describe('resolveSystemNotePath', () => {
	it('returns null when there is no active note', () => {
		const app = vaultApp(['system.md']);
		expect(resolveSystemNotePath(app as never, null)).toBeNull();
	});

	it('finds system.md in the same folder as the active note', () => {
		const app = vaultApp(['Rust/system.md', 'Rust/a.md']);
		expect(resolveSystemNotePath(app as never, 'Rust/a.md')).toBe('Rust/system.md');
	});

	it('finds system.md in a parent folder', () => {
		const app = vaultApp(['Rust/system.md', 'Rust/notes/a.md']);
		expect(resolveSystemNotePath(app as never, 'Rust/notes/a.md')).toBe('Rust/system.md');
	});

	it('prefers the nearer system.md over a parent', () => {
		const app = vaultApp([
			'system.md',
			'Bucataras/system.md',
			'Bucataras/planificare/system.md',
			'Bucataras/planificare/retete/foo.md',
		]);
		expect(resolveSystemNotePath(app as never, 'Bucataras/planificare/retete/foo.md')).toBe(
			'Bucataras/planificare/system.md',
		);
	});

	it('walks up to a parent folder system.md', () => {
		const app = vaultApp(['Rust/system.md', 'Rust/deep/nested/a.md']);
		expect(resolveSystemNotePath(app as never, 'Rust/deep/nested/a.md')).toBe('Rust/system.md');
	});

	it('finds vault-root system.md', () => {
		const app = vaultApp(['system.md', 'Inbox/Note.md']);
		expect(resolveSystemNotePath(app as never, 'Inbox/Note.md')).toBe('system.md');
	});

	it('finds system.md beside a vault-root note', () => {
		const app = vaultApp(['system.md', 'Note.md']);
		expect(resolveSystemNotePath(app as never, 'Note.md')).toBe('system.md');
	});

	it('returns null when no system.md exists on the path', () => {
		const app = vaultApp(['Rust/notes/a.md', 'Other/system.md']);
		expect(resolveSystemNotePath(app as never, 'Rust/notes/a.md')).toBeNull();
	});
});

describe('loadSystemNoteExtra', () => {
	it('loads content for the resolved system note', async () => {
		const app = vaultApp(['Rust/system.md', 'Rust/a.md'], {
			'Rust/system.md': 'Be a Rust tutor.',
		});
		await expect(loadSystemNoteExtra(app as never, 'Rust/a.md')).resolves.toEqual({
			path: 'Rust/system.md',
			content: 'Be a Rust tutor.',
		});
	});

	it('returns null when unresolved', async () => {
		const app = vaultApp(['Rust/a.md']);
		await expect(loadSystemNoteExtra(app as never, 'Rust/a.md')).resolves.toBeNull();
	});

	it('treats empty content as a valid override', async () => {
		const app = vaultApp(['system.md', 'Note.md'], { 'system.md': '   ' });
		await expect(loadSystemNoteExtra(app as never, 'Note.md')).resolves.toEqual({
			path: 'system.md',
			content: '   ',
		});
	});
});
