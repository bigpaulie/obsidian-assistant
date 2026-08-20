export const MOBILE_KEYBOARD_INSET_THRESHOLD = 50;

export interface ComposerKeyboardInsetInput {
	innerHeight: number;
	restInnerHeight: number;
	visualViewportHeight?: number;
	visualViewportOffsetTop?: number;
	obsidianKeyboardHeight: number;
	containerBottom: number;
}

/**
 * Padding the chat leaf needs so the composer sits on the software keyboard.
 *
 * 1.1.1 sized a flex child; that height was ignored, and visualViewport was often 0.
 * 1.1.2 padded with max(ours, --keyboard-height) and stacked on Obsidian’s own inset.
 * 1.1.3 measured only visualViewport overlap, which is ~0 when Capacitor KeyboardResize
 * is none, so the composer went under the keyboard again.
 *
 * Use --keyboard-height when the visual viewport does not shrink. Do not also apply
 * --keyboard-height in CSS. If the layout viewport already shrank (typical Android),
 * only pad leftover overflow past innerHeight.
 */
export function composerKeyboardInset(input: ComposerKeyboardInsetInput): number {
	const layoutShrunkBy = Math.max(0, input.restInnerHeight - input.innerHeight);
	if (layoutShrunkBy > MOBILE_KEYBOARD_INSET_THRESHOLD) {
		return Math.max(0, input.containerBottom - input.innerHeight);
	}

	let viewportKeyboard = 0;
	if (input.visualViewportHeight != null) {
		viewportKeyboard = Math.max(
			0,
			input.innerHeight - input.visualViewportHeight - (input.visualViewportOffsetTop ?? 0),
		);
	}
	const keyboardHeight = Math.max(viewportKeyboard, input.obsidianKeyboardHeight);
	if (keyboardHeight <= MOBILE_KEYBOARD_INSET_THRESHOLD) {
		return 0;
	}
	return Math.max(0, input.containerBottom - (input.innerHeight - keyboardHeight));
}
