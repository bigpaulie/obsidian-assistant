export interface SavedPromptTriggerSegment {
	lineStart: number;
	segment: string;
}

export interface SavedPromptSpaceTrigger extends SavedPromptTriggerSegment {
	kind: 'picker' | 'expand';
}

/** Whether `@` at `lineStart` begins a saved-prompt trigger (line start or after whitespace). */
export function isSavedPromptTriggerBoundary(text: string, lineStart: number): boolean {
	if (lineStart === 0) {
		return true;
	}
	const before = text[lineStart - 1];
	return before === undefined || /\s/.test(before);
}

/** Parse the current line segment ending at `cursorPos` if it starts with `@`. */
export function savedPromptTriggerSegment(text: string, cursorPos: number): SavedPromptTriggerSegment | null {
	const before = text.slice(0, cursorPos);
	const lineStart = before.lastIndexOf('\n') + 1;
	const segment = before.slice(lineStart);
	if (!segment.startsWith('@') || !isSavedPromptTriggerBoundary(text, lineStart)) {
		return null;
	}
	return { lineStart, segment };
}

/** Detect `@` / `@name` followed by a space just typed at `cursorPos`. */
export function savedPromptSpaceTrigger(text: string, cursorPos: number): SavedPromptSpaceTrigger | null {
	if (cursorPos < 2 || text[cursorPos - 1] !== ' ') {
		return null;
	}
	const beforeSpace = text.slice(0, cursorPos - 1);
	const lineStart = beforeSpace.lastIndexOf('\n') + 1;
	const segment = beforeSpace.slice(lineStart);
	if (!isSavedPromptTriggerBoundary(text, lineStart)) {
		return null;
	}
	if (segment === '@') {
		return { lineStart, segment, kind: 'picker' };
	}
	if (/^@.+$/.test(segment)) {
		return { lineStart, segment, kind: 'expand' };
	}
	return null;
}
