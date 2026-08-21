import { describe, expect, it } from 'vitest';
import {
	MOBILE_KEYBOARD_INSET_THRESHOLD,
	composerKeyboardInset,
} from '../../src/ui/keyboard-inset';

describe('composerKeyboardInset', () => {
	it('pads only leftover overflow when the layout viewport already shrank', () => {
		expect(
			composerKeyboardInset({
				innerHeight: 500,
				restInnerHeight: 800,
				visualViewportHeight: 500,
				obsidianKeyboardHeight: 300,
				containerBottom: 790,
			}),
		).toBe(290);
	});

	it('uses --keyboard-height when the visual viewport does not shrink', () => {
		expect(
			composerKeyboardInset({
				innerHeight: 800,
				restInnerHeight: 800,
				visualViewportHeight: 800,
				visualViewportOffsetTop: 0,
				obsidianKeyboardHeight: 300,
				containerBottom: 790,
			}),
		).toBe(290);
	});

	it('uses visualViewport overlap when it is larger than --keyboard-height', () => {
		expect(
			composerKeyboardInset({
				innerHeight: 800,
				restInnerHeight: 800,
				visualViewportHeight: 500,
				visualViewportOffsetTop: 0,
				obsidianKeyboardHeight: 100,
				containerBottom: 790,
			}),
		).toBe(290);
	});

	it('returns 0 when the keyboard is at or below the inset threshold', () => {
		expect(
			composerKeyboardInset({
				innerHeight: 800,
				restInnerHeight: 800,
				visualViewportHeight: 800,
				obsidianKeyboardHeight: MOBILE_KEYBOARD_INSET_THRESHOLD,
				containerBottom: 800,
			}),
		).toBe(0);
		expect(
			composerKeyboardInset({
				innerHeight: 800,
				restInnerHeight: 810,
				obsidianKeyboardHeight: 0,
				containerBottom: 800,
			}),
		).toBe(0);
	});
});
