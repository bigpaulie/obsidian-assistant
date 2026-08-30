import { describe, expect, it } from 'vitest';
import {
	buildUserContent,
	contentPartsToResponsesContent,
	contentToDisplayText,
} from '../../src/llm/content-parts';

describe('buildUserContent', () => {
	it('returns trimmed text when there are no photos', () => {
		expect(buildUserContent('  hello  ', [])).toBe('hello');
	});

	it('builds text and image parts when both are present', () => {
		expect(buildUserContent('describe this', [{ dataUrl: 'data:image/png;base64,abc' }])).toEqual([
			{ type: 'text', text: 'describe this' },
			{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'auto' } },
		]);
	});

	it('builds image-only parts when text is empty', () => {
		expect(buildUserContent('', [{ dataUrl: 'data:image/jpeg;base64,xyz' }])).toEqual([
			{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,xyz', detail: 'auto' } },
		]);
	});
});

describe('contentToDisplayText', () => {
	it('passes through string content', () => {
		expect(contentToDisplayText('hello')).toBe('hello');
	});

	it('extracts text from content parts', () => {
		expect(
			contentToDisplayText([
				{ type: 'text', text: 'caption' },
				{ type: 'image_url', image_url: { url: 'data:image/png;base64,x' } },
			]),
		).toBe('caption');
	});

	it('uses a placeholder for image-only content', () => {
		expect(
			contentToDisplayText([{ type: 'image_url', image_url: { url: 'data:image/png;base64,x' } }]),
		).toBe('[Photo attached]');
	});
});

describe('contentPartsToResponsesContent', () => {
	it('passes through string content', () => {
		expect(contentPartsToResponsesContent('hi')).toBe('hi');
	});

	it('maps content parts to Responses API input items', () => {
		expect(
			contentPartsToResponsesContent([
				{ type: 'text', text: 'look' },
				{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
			]),
		).toEqual([
			{ type: 'input_text', text: 'look' },
			{ type: 'input_image', image_url: 'data:image/png;base64,abc' },
		]);
	});
});
