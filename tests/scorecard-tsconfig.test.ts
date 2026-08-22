import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8')) as Record<string, unknown>;
}

function walkFiles(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === '.git') {
			continue;
		}
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkFiles(full, acc);
		} else {
			acc.push(full);
		}
	}
	return acc;
}

describe('scorecard TypeScript layout', () => {
	it('keeps the plugin tsconfig src-only without tests or paths', () => {
		const config = readJson('tsconfig.json');
		expect(config.include).toEqual(['src/**/*.ts']);
		expect(config.include).not.toContain('tests/**/*.ts');
		const compilerOptions = config.compilerOptions as Record<string, unknown>;
		expect(compilerOptions.paths).toBeUndefined();
	});

	it('does not list plugin sources as roots in the test tsconfig', () => {
		const config = readJson('tsconfig.test.json');
		expect(config.include).toEqual(['tests/**/*.ts']);
		expect(config.include).not.toContain('src/**/*.ts');
	});

	it('does not ship a file named obsidian.ts outside node_modules', () => {
		const hits = walkFiles(repoRoot).filter((file) => path.basename(file) === 'obsidian.ts');
		expect(hits).toEqual([]);
	});

	it('typechecks only plugin sources, not tests', () => {
		const raw = execFileSync('npx', ['tsc', '--showConfig'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		const shown = JSON.parse(raw) as { files?: string[] };
		const files = shown.files ?? [];
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const relative = path.relative(repoRoot, file).split(path.sep).join('/');
			expect(relative.startsWith('src/')).toBe(true);
			expect(relative.startsWith('tests/')).toBe(false);
		}
	});
});
