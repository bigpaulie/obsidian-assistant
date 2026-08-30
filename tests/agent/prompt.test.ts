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

	it('includes user prompt last after active note, references, and RAG', () => {
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
		expect(prompt.indexOf('Retrieved vault context')).toBeLessThan(prompt.indexOf('Be terse.'));
		expect(prompt.endsWith('Be terse.')).toBe(true);
	});

	it('frames a system note override last with priority over vault context', () => {
		const prompt = buildSystemPrompt({
			userPrompt: 'always respond in German',
			systemNotePath: 'Bucataras/system.md',
			activeNotePath: 'Bucataras/planificare/retete/foo.md',
			ragHits: [hit],
			referencedNotes: [],
		});
		expect(prompt).toContain('[[Bucataras/system.md]]');
		expect(prompt).toContain('highest priority');
		expect(prompt).toContain('always respond in German');
		expect(prompt.indexOf('Retrieved vault context')).toBeLessThan(
			prompt.indexOf('highest priority'),
		);
		expect(prompt.indexOf('highest priority')).toBeLessThan(prompt.indexOf('always respond in German'));
	});
});
