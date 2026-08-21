import { describe, expect, it } from 'vitest';
import { BUILTIN_SYSTEM_PROMPT, buildSystemPrompt } from '../../src/agent/prompt';
import type { SearchHit } from '../../src/rag/indexer';

const hit: SearchHit = {
	path: 'Rag.md',
	title: 'Rag',
	headings: 'Rag',
	snippet: 'retrieved',
	score: 1,
};

describe('buildSystemPrompt', () => {
	it('starts from the built-in prompt and omits empty sections', () => {
		const prompt = buildSystemPrompt({
			userPrompt: '  ',
			activeNotePath: null,
			ragHits: [],
			referencedNotes: [],
		});
		expect(prompt).toBe(BUILTIN_SYSTEM_PROMPT);
		expect(prompt).not.toContain('currently viewing');
		expect(prompt).not.toContain('Retrieved vault context');
		expect(prompt).not.toContain('explicitly referenced');
	});

	it('includes user prompt, active note, references, and RAG, preferring references', () => {
		const prompt = buildSystemPrompt({
			userPrompt: 'Be terse.',
			activeNotePath: 'Now.md',
			ragHits: [hit],
			referencedNotes: [{ path: 'Ref.md', content: 'pinned' }],
		});
		expect(prompt.startsWith(BUILTIN_SYSTEM_PROMPT)).toBe(true);
		expect(prompt).toContain('Be terse.');
		expect(prompt).toContain('[[Now.md]]');
		expect(prompt).toContain('Prefer them over retrieved chunks');
		expect(prompt).toContain('[[Ref.md]]\npinned');
		expect(prompt).toContain('Retrieved vault context:');
		expect(prompt).toContain('[[Rag.md]]');
		expect(prompt.indexOf('explicitly referenced')).toBeLessThan(prompt.indexOf('Retrieved vault context'));
	});
});
