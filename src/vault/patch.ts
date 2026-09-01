export type TextPatchResult =
	| { ok: true; content: string; occurrences: number }
	| { ok: false; error: string };

export function applyTextPatch(
	content: string,
	oldText: string,
	newText: string,
	replaceAll = false,
): TextPatchResult {
	if (!oldText) {
		return { ok: false, error: 'old_text must not be empty.' };
	}

	const occurrences = countOccurrences(content, oldText);
	if (occurrences === 0) {
		return { ok: false, error: 'Text to replace was not found in the note.' };
	}
	if (occurrences > 1 && !replaceAll) {
		return {
			ok: false,
			error: `Found ${occurrences} occurrences. Include more surrounding context in old_text, or set replace_all to true.`,
		};
	}

	const patched = replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, newText);
	return { ok: true, content: patched, occurrences };
}

function countOccurrences(content: string, needle: string): number {
	if (!needle) {
		return 0;
	}
	let count = 0;
	let index = 0;
	while (true) {
		const found = content.indexOf(needle, index);
		if (found < 0) {
			return count;
		}
		count += 1;
		index = found + needle.length;
	}
}
