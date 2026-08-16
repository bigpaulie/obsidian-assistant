import type { CachedMetadata, TFile } from 'obsidian';
import { MAX_CHUNK_CHARS } from '../constants';

export interface IndexedChunk {
	id: string;
	path: string;
	title: string;
	tags: string;
	headings: string;
	body: string;
}

interface Section {
	heading: string;
	body: string;
}

/** Split a markdown note into heading-aware chunks capped at MAX_CHUNK_CHARS. */
export function chunkNote(file: TFile, content: string, cache: CachedMetadata | null): IndexedChunk[] {
	const title = file.basename;
	const tags = extractTags(cache);
	const sections = splitByHeadings(content, cache, title);
	const chunks: IndexedChunk[] = [];
	let index = 0;

	for (const section of sections) {
		for (const piece of splitBySize(section.body, MAX_CHUNK_CHARS)) {
			if (!piece.trim()) {
				continue;
			}
			chunks.push({
				id: `${file.path}::${index}`,
				path: file.path,
				title,
				tags,
				headings: section.heading,
				body: piece.trim(),
			});
			index += 1;
		}
	}

	if (chunks.length === 0) {
		chunks.push({
			id: `${file.path}::0`,
			path: file.path,
			title,
			tags,
			headings: title,
			body: content.trim().slice(0, MAX_CHUNK_CHARS),
		});
	}

	return chunks;
}

function extractTags(cache: CachedMetadata | null): string {
	const tags = new Set<string>();
	for (const tag of cache?.tags ?? []) {
		tags.add(tag.tag.replace(/^#/, ''));
	}
	const frontmatterTags: unknown = cache?.frontmatter
		? (cache.frontmatter['tags'] as unknown)
		: undefined;
	if (typeof frontmatterTags === 'string') {
		for (const tag of frontmatterTags.split(/[,\s]+/)) {
			if (tag) {
				tags.add(tag.replace(/^#/, ''));
			}
		}
	} else if (Array.isArray(frontmatterTags)) {
		for (const tag of frontmatterTags) {
			if (typeof tag === 'string' && tag) {
				tags.add(tag.replace(/^#/, ''));
			}
		}
	}
	return [...tags].join(' ');
}

function splitByHeadings(content: string, cache: CachedMetadata | null, fallbackTitle: string): Section[] {
	const headings = cache?.headings;
	if (!headings || headings.length === 0) {
		return [{ heading: fallbackTitle, body: stripFrontmatter(content) }];
	}

	const sections: Section[] = [];
	const body = content;
	const first = headings[0];
	if (first && first.position.start.offset > 0) {
		const preface = stripFrontmatter(body.slice(0, first.position.start.offset)).trim();
		if (preface) {
			sections.push({ heading: fallbackTitle, body: preface });
		}
	}

	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		if (!heading) {
			continue;
		}
		const start = heading.position.start.offset;
		const next = headings[i + 1];
		const end = next ? next.position.start.offset : body.length;
		const trail = headingTrail(headings, i);
		sections.push({
			heading: trail || heading.heading,
			body: body.slice(start, end).trim(),
		});
	}

	return sections.length > 0 ? sections : [{ heading: fallbackTitle, body: stripFrontmatter(content) }];
}

function headingTrail(
	headings: NonNullable<CachedMetadata['headings']>,
	index: number,
): string {
	const current = headings[index];
	if (!current) {
		return '';
	}
	const parts: string[] = [];
	let level = current.level + 1;
	for (let i = index; i >= 0; i--) {
		const heading = headings[i];
		if (!heading) {
			continue;
		}
		if (heading.level < level) {
			parts.unshift(heading.heading);
			level = heading.level;
		}
		if (level <= 1) {
			break;
		}
	}
	return parts.join(' / ');
}

function splitBySize(text: string, maxChars: number): string[] {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) {
		return trimmed ? [trimmed] : [];
	}

	const paragraphs = trimmed.split(/\n{2,}/);
	const pieces: string[] = [];
	let buffer = '';

	const flush = (): void => {
		if (buffer.trim()) {
			pieces.push(buffer.trim());
			buffer = '';
		}
	};

	for (const paragraph of paragraphs) {
		if (paragraph.length > maxChars) {
			flush();
			for (const hard of hardWrap(paragraph, maxChars)) {
				pieces.push(hard);
			}
			continue;
		}
		if (!buffer) {
			buffer = paragraph;
			continue;
		}
		if (`${buffer}\n\n${paragraph}`.length <= maxChars) {
			buffer = `${buffer}\n\n${paragraph}`;
		} else {
			flush();
			buffer = paragraph;
		}
	}
	flush();
	return pieces;
}

function hardWrap(text: string, maxChars: number): string[] {
	const pieces: string[] = [];
	for (let i = 0; i < text.length; i += maxChars) {
		pieces.push(text.slice(i, i + maxChars));
	}
	return pieces;
}

function stripFrontmatter(content: string): string {
	if (!content.startsWith('---')) {
		return content;
	}
	const end = content.indexOf('\n---', 3);
	if (end === -1) {
		return content;
	}
	return content.slice(end + 4);
}
