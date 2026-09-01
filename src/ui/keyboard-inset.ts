export const MOBILE_KEYBOARD_INSET_THRESHOLD = 50;

export interface ComposerKeyboardInsetInput {
	innerHeight: number;
	restInnerHeight: number;
	visualViewportHeight?: number;
	visualViewportOffsetTop?: number;
	obsidianKeyboardHeight: number;
	containerBottom: number;
}

export interface MobileVisibleViewportHeightInput {
	innerHeight: number;
	restInnerHeight?: number;
	visualViewportHeight?: number;
	visualViewportOffsetTop?: number;
	obsidianKeyboardHeight: number;
}

export interface MobileVisibleBottomYInput extends MobileVisibleViewportHeightInput {
	forceKeyboardOpen?: boolean;
}

export interface ModalKeyboardContainerInsetInput extends MobileVisibleBottomYInput {
	margin?: number;
}

function keyboardOverlapHeight(input: {
	innerHeight: number;
	visualViewportHeight?: number;
	visualViewportOffsetTop?: number;
	obsidianKeyboardHeight: number;
}): number {
	let viewportKeyboard = 0;
	if (input.visualViewportHeight != null) {
		viewportKeyboard = Math.max(
			0,
			input.innerHeight - input.visualViewportHeight - (input.visualViewportOffsetTop ?? 0),
		);
	}
	return Math.max(viewportKeyboard, input.obsidianKeyboardHeight);
}

/**
 * Usable screen height above the software keyboard for sizing mobile overlays.
 */
export function mobileVisibleViewportHeight(input: MobileVisibleViewportHeightInput): number {
	const restInnerHeight = input.restInnerHeight ?? input.innerHeight;
	const layoutShrunkBy = Math.max(0, restInnerHeight - input.innerHeight);
	if (layoutShrunkBy > MOBILE_KEYBOARD_INSET_THRESHOLD) {
		return input.innerHeight;
	}

	const keyboardHeight = keyboardOverlapHeight(input);
	if (keyboardHeight <= MOBILE_KEYBOARD_INSET_THRESHOLD) {
		return input.innerHeight;
	}
	return input.innerHeight - keyboardHeight;
}

/**
 * Y coordinate of the bottom edge of the usable screen above the software keyboard.
 */
export function mobileVisibleBottomY(input: MobileVisibleBottomYInput): number {
	const restInnerHeight = input.restInnerHeight ?? input.innerHeight;
	const layoutShrunkBy = Math.max(0, restInnerHeight - input.innerHeight);
	if (layoutShrunkBy > MOBILE_KEYBOARD_INSET_THRESHOLD) {
		return input.innerHeight;
	}

	let keyboardHeight = keyboardOverlapHeight(input);
	const keyboardReported = input.obsidianKeyboardHeight > MOBILE_KEYBOARD_INSET_THRESHOLD;
	if (keyboardHeight <= MOBILE_KEYBOARD_INSET_THRESHOLD && input.forceKeyboardOpen && keyboardReported) {
		keyboardHeight = input.obsidianKeyboardHeight;
	}

	if (keyboardHeight <= MOBILE_KEYBOARD_INSET_THRESHOLD) {
		return input.innerHeight;
	}

	if (input.visualViewportHeight != null) {
		const viewportBottom = (input.visualViewportOffsetTop ?? 0) + input.visualViewportHeight;
		return Math.min(viewportBottom, input.innerHeight - keyboardHeight);
	}

	return input.innerHeight - keyboardHeight;
}

/** Padding a modal container needs so content stays above the software keyboard. */
export function modalKeyboardContainerInset(input: ModalKeyboardContainerInsetInput): number {
	const margin = input.margin ?? 0;
	const visibleBottomY = mobileVisibleBottomY(input);
	if (visibleBottomY >= input.innerHeight) {
		return 0;
	}
	return Math.max(0, input.innerHeight - visibleBottomY + margin);
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

	const keyboardHeight = keyboardOverlapHeight(input);
	if (keyboardHeight <= MOBILE_KEYBOARD_INSET_THRESHOLD) {
		return 0;
	}
	return Math.max(0, input.containerBottom - (input.innerHeight - keyboardHeight));
}
