import { requestUrl } from 'obsidian';
import { LlmError, apiErrorMessage, sanitizeErrorText } from './errors';

export async function postJson(
	url: string,
	headers: Record<string, string>,
	body: unknown,
): Promise<{ json: unknown; status: number }> {
	const response = await requestUrl({
		url,
		method: 'POST',
		headers,
		body: JSON.stringify(body),
		throw: false,
	});
	return { json: parseResponse(response.status, response.text), status: response.status };
}

export async function getJson(
	url: string,
	headers: Record<string, string>,
): Promise<{ json: unknown; status: number }> {
	const response = await requestUrl({
		url,
		method: 'GET',
		headers,
		throw: false,
	});
	return { json: parseResponse(response.status, response.text), status: response.status };
}

export function parseResponse(status: number, text: string): unknown {
	let json: unknown = undefined;
	if (text) {
		try {
			json = JSON.parse(text) as unknown;
		} catch {
			json = undefined;
		}
	}
	if (status >= 400) {
		const excerpt = text.trim() ? sanitizeErrorText(text.trim().slice(0, 800)) : '';
		throw new LlmError(apiErrorMessage(json) || excerpt || `Provider request failed (${status}).`, status, {
			httpStatus: status,
			body: excerpt,
		});
	}
	if (json === undefined) {
		throw new LlmError('Provider returned a non-JSON response.', status, { httpStatus: status });
	}
	return json;
}
