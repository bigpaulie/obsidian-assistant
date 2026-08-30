export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const EXTENSION_MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
};

export interface PendingPhoto {
	id: string;
	name: string;
	mimeType: string;
	dataUrl: string;
}

/** Resolve a supported image MIME type from File metadata (macOS often leaves `type` empty). */
export function resolveImageMime(file: File): string | null {
	if (file.type && ALLOWED_IMAGE_TYPES.has(file.type)) {
		return file.type;
	}
	const ext = file.name.split('.').pop()?.toLowerCase();
	if (!ext) {
		return null;
	}
	const mime = EXTENSION_MIME[ext];
	return mime && ALLOWED_IMAGE_TYPES.has(mime) ? mime : null;
}

export async function readImageFile(file: File, maxBytes: number): Promise<PendingPhoto> {
	const mimeType = resolveImageMime(file);
	if (!mimeType) {
		throw new Error('Only JPEG, PNG, WebP, and GIF images are supported.');
	}
	if (file.size > maxBytes) {
		const maxMb = Math.round(maxBytes / (1024 * 1024));
		throw new Error(`Image is too large (max ${maxMb} MB).`);
	}
	const dataUrl = await readFileAsDataUrl(file);
	return {
		id: createPhotoId(),
		name: file.name,
		mimeType,
		dataUrl: normalizeDataUrlMime(dataUrl, mimeType),
	};
}

function createPhotoId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** FileReader may emit octet-stream when `file.type` is empty; fix so previews render. */
function normalizeDataUrlMime(dataUrl: string, mimeType: string): string {
	if (!dataUrl.startsWith('data:') || dataUrl.startsWith(`data:${mimeType}`)) {
		return dataUrl;
	}
	const comma = dataUrl.indexOf(',');
	if (comma < 0) {
		return dataUrl;
	}
	return `data:${mimeType}${dataUrl.slice(dataUrl.indexOf(';'), comma)}${dataUrl.slice(comma)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				resolve(reader.result);
				return;
			}
			reject(new Error('Failed to read image.'));
		};
		reader.onerror = () => reject(new Error('Failed to read image.'));
		reader.readAsDataURL(file);
	});
}
