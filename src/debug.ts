import { PLUGIN_NAME } from './constants';
import { sanitizeErrorText } from './llm/errors';
import type { VaultAssistantSettings } from './settings';

export type DebugPayload = Record<string, string | number | boolean | undefined>;

/** Gated console logging. No-op unless Debug mode is on. Never logs unsanitized strings. */
export function debugLog(settings: VaultAssistantSettings, event: string, payload?: DebugPayload): void {
	if (!settings.debugMode) {
		return;
	}
	const safe = sanitizePayload(payload);
	if (safe) {
		console.debug(`[${PLUGIN_NAME}] ${event}`, safe);
		return;
	}
	console.debug(`[${PLUGIN_NAME}] ${event}`);
}

export function formatDebugLines(payload: DebugPayload): string {
	return Object.entries(sanitizePayload(payload) ?? {})
		.filter(([, value]) => value !== undefined && value !== '')
		.map(([key, value]) => `${key}: ${String(value)}`)
		.join('\n');
}

function sanitizePayload(payload?: DebugPayload): DebugPayload | undefined {
	if (!payload) {
		return undefined;
	}
	const safe: DebugPayload = {};
	for (const [key, value] of Object.entries(payload)) {
		if (value === undefined) {
			continue;
		}
		safe[key] = typeof value === 'string' ? sanitizeErrorText(value) : value;
	}
	return safe;
}
