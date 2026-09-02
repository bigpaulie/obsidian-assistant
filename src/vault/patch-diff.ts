export type PatchDiffLine = { kind: 'context' | 'remove' | 'add'; text: string };

export const PATCH_PREVIEW_MAX_CHARS = 400;

export function buildPatchDiffLines(
	oldText: string,
	newText: string,
	maxChars = PATCH_PREVIEW_MAX_CHARS,
): PatchDiffLine[] {
	const oldLines = splitLines(oldText);
	const newLines = splitLines(newText);

	let prefix = 0;
	while (
		prefix < oldLines.length &&
		prefix < newLines.length &&
		oldLines[prefix] === newLines[prefix]
	) {
		prefix += 1;
	}

	let oldSuffix = oldLines.length;
	let newSuffix = newLines.length;
	while (
		oldSuffix > prefix &&
		newSuffix > prefix &&
		oldLines[oldSuffix - 1] === newLines[newSuffix - 1]
	) {
		oldSuffix -= 1;
		newSuffix -= 1;
	}

	const lines: PatchDiffLine[] = [];
	for (let index = 0; index < prefix; index += 1) {
		const text = oldLines[index];
		if (text === undefined) {
			break;
		}
		lines.push({ kind: 'context', text });
	}
	for (let index = prefix; index < oldSuffix; index += 1) {
		const text = oldLines[index];
		if (text === undefined) {
			break;
		}
		lines.push({ kind: 'remove', text });
	}
	for (let index = prefix; index < newSuffix; index += 1) {
		const text = newLines[index];
		if (text === undefined) {
			break;
		}
		lines.push({ kind: 'add', text });
	}
	for (let index = oldSuffix; index < oldLines.length; index += 1) {
		const text = oldLines[index];
		if (text === undefined) {
			break;
		}
		lines.push({ kind: 'context', text });
	}

	return truncateDiffLines(lines, maxChars);
}

function splitLines(text: string): string[] {
	if (text === '') {
		return [];
	}
	return text.split('\n');
}

function truncateDiffLines(lines: PatchDiffLine[], maxChars: number): PatchDiffLine[] {
	let used = 0;
	const truncated: PatchDiffLine[] = [];

	for (const line of lines) {
		const lineLength = line.text.length + 1;
		if (used + lineLength > maxChars) {
			if (truncated.length === 0 && line.text.length > maxChars) {
				truncated.push({ kind: line.kind, text: `${line.text.slice(0, maxChars)}…` });
			}
			truncated.push({ kind: 'context', text: '… (preview truncated)' });
			return truncated;
		}
		truncated.push(line);
		used += lineLength;
	}

	return truncated;
}
