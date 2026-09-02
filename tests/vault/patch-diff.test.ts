import { describe, expect, it } from 'vitest';
import { buildPatchDiffLines } from '../../src/vault/patch-diff';

describe('buildPatchDiffLines', () => {
	it('shows one removed and one added line for a single-line replace', () => {
		expect(buildPatchDiffLines('hello world', 'hello there')).toEqual([
			{ kind: 'remove', text: 'hello world' },
			{ kind: 'add', text: 'hello there' },
		]);
	});

	it('shows only removed lines for a deletion', () => {
		expect(buildPatchDiffLines('remove me please', '')).toEqual([
			{ kind: 'remove', text: 'remove me please' },
		]);
	});

	it('shows shared prefix and suffix as context with changed middle lines', () => {
		expect(
			buildPatchDiffLines('# Title\n\nOld paragraph\n\n## Next', '# Title\n\nNew paragraph\n\n## Next'),
		).toEqual([
			{ kind: 'context', text: '# Title' },
			{ kind: 'context', text: '' },
			{ kind: 'remove', text: 'Old paragraph' },
			{ kind: 'add', text: 'New paragraph' },
			{ kind: 'context', text: '' },
			{ kind: 'context', text: '## Next' },
		]);
	});

	it('trims identical prefix and suffix lines', () => {
		expect(buildPatchDiffLines('keep\nold\nkeep', 'keep\nnew\nkeep')).toEqual([
			{ kind: 'context', text: 'keep' },
			{ kind: 'remove', text: 'old' },
			{ kind: 'add', text: 'new' },
			{ kind: 'context', text: 'keep' },
		]);
	});

	it('truncates when total preview chars exceed the limit', () => {
		const oldText = 'a'.repeat(250);
		const newText = 'b'.repeat(250);
		const lines = buildPatchDiffLines(oldText, newText, 400);

		expect(lines.at(-1)).toEqual({ kind: 'context', text: '… (preview truncated)' });
		expect(lines.some((line) => line.kind === 'remove')).toBe(true);
		expect(lines.filter((line) => line.kind === 'add')).toHaveLength(0);
	});
});
