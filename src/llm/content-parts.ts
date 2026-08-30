import { messageContentToString } from './thinking';
import type { ContentPart } from './types';

const PHOTO_PLACEHOLDER = '[Photo attached]';

/** Build a user message body from text and optional photo data URLs. */
export function buildUserContent(
	text: string,
	photos: Array<{ dataUrl: string }>,
): string | ContentPart[] {
	const trimmed = text.trim();
	if (photos.length === 0) {
		return trimmed;
	}
	const parts: ContentPart[] = [];
	if (trimmed) {
		parts.push({ type: 'text', text: trimmed });
	}
	for (const photo of photos) {
		parts.push({
			type: 'image_url',
			image_url: { url: photo.dataUrl, detail: 'auto' },
		});
	}
	return parts;
}

/** Flatten message content to a display/persistence string. */
export function contentToDisplayText(content: string | ContentPart[] | null | undefined): string | null {
	if (content === null || content === undefined) {
		return null;
	}
	if (typeof content === 'string') {
		return content;
	}
	const text = messageContentToString(content)?.trim() ?? '';
	const hasImages = content.some((part) => part.type === 'image_url');
	if (text) {
		return text;
	}
	if (hasImages) {
		return PHOTO_PLACEHOLDER;
	}
	return '';
}

/** Map canonical content parts to Responses API user message content. */
export function contentPartsToResponsesContent(content: string | ContentPart[] | null): string | unknown[] {
	if (content === null || content === undefined) {
		return '';
	}
	if (typeof content === 'string') {
		return content;
	}
	return content.map((part) => {
		if (part.type === 'text') {
			return { type: 'input_text', text: part.text };
		}
		return { type: 'input_image', image_url: part.image_url.url };
	});
}
