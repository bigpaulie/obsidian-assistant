import { describe, expect, it } from 'vitest';
import { BUILTIN_SYSTEM_PROMPT, buildSystemPrompt } from '../../src/agent/prompt';

describe('buildSystemPrompt', () => {
	it('starts from the built-in prompt and omits empty sections', () => {
		const prompt = buildSystemPrompt({
			userPrompt: '  ',
			activeNotePath: null,
			referencedNotes: [],
		});
		expect(prompt).toBe(BUILTIN_SYSTEM_PROMPT);
		expect(prompt).toContain('search_notes');
		expect(prompt).toContain('propose_patch_note');
		expect(prompt).toContain('propose_update_note');
		expect(prompt).toContain('three or more');
		expect(prompt).toContain('replace_all');
		expect(prompt).not.toContain('currently viewing');
		expect(prompt).not.toContain('Retrieved vault context');
		expect(prompt).not.toContain('explicitly referenced');
	});

	it('includes user prompt last after active note and references', () => {
		const prompt = buildSystemPrompt({
			userPrompt: 'Be terse.',
			activeNotePath: 'Now.md',
			referencedNotes: [{ path: 'Ref.md', content: 'pinned' }],
		});
		expect(prompt.startsWith(BUILTIN_SYSTEM_PROMPT)).toBe(true);
		expect(prompt).toContain('Be terse.');
		expect(prompt).toContain('[[Now.md]]');
		expect(prompt).toContain('Prefer them over search results');
		expect(prompt).toContain('[[Ref.md]]\npinned');
		expect(prompt).not.toContain('Retrieved vault context');
		expect(prompt.indexOf('explicitly referenced')).toBeLessThan(prompt.indexOf('Be terse.'));
		expect(prompt.endsWith('Be terse.')).toBe(true);
	});

	it('frames a system note override last with priority over referenced notes', () => {
		const prompt = buildSystemPrompt({
			userPrompt: 'always respond in German',
			systemNotePath: 'Bucataras/system.md',
			activeNotePath: 'Bucataras/planificare/retete/foo.md',
			referencedNotes: [],
		});
		expect(prompt).toContain('[[Bucataras/system.md]]');
		expect(prompt).toContain('highest priority');
		expect(prompt).toContain('always respond in German');
		expect(prompt.indexOf('currently viewing')).toBeLessThan(prompt.indexOf('highest priority'));
		expect(prompt.indexOf('highest priority')).toBeLessThan(prompt.indexOf('always respond in German'));
	});
});
