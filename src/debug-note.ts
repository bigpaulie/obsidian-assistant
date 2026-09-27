import { App } from 'obsidian';
import { DEBUG_NOTES_FOLDER } from './constants';
import { debugLog, formatDebugLines, type DebugPayload } from './debug';
import { errorMessage, sanitizeErrorText } from './llm/errors';
import type { VaultAssistantSettings } from './settings';
import { isRecord } from './utils';
import { createNote } from './vault/notes';

const SENSITIVE_KEYS = new Set([
	'authorization',
	'api_key',
	'apikey',
	'access_token',
	'secret',
	'password',
]);

export interface DebugExchangeInput {
	api: 'completions' | 'responses';
	endpoint: string;
	request: unknown;
	response?: unknown;
	httpStatus?: number;
	error?: string;
}

type DebugEvent =
	| {
			type: 'exchange';
			api: 'completions' | 'responses';
			endpoint: string;
			request: unknown;
			response?: unknown;
			httpStatus?: number;
			error?: string;
	  }
	| { type: 'tool'; name: string; parameters: unknown };

/**
 * One chat send of redacted model exchanges and tool calls.
 * Stores only sanitized copies. Never receives request headers.
 */
export class DebugSession {
	notePath?: string;
	noteError?: string;
	private readonly events: DebugEvent[] = [];
	private readonly secrets: readonly string[];
	private written = false;

	constructor(private readonly settings: VaultAssistantSettings) {
		this.secrets = configuredSecrets(settings);
	}

	recordExchange(input: DebugExchangeInput): void {
		try {
			const event: DebugEvent = {
				type: 'exchange',
				api: input.api,
				endpoint: redactString(input.endpoint, this.secrets),
				request: redactValue(input.request, this.secrets),
				httpStatus: input.httpStatus,
			};
			if (input.error !== undefined) {
				event.error = redactString(input.error, this.secrets);
			} else {
				event.response = redactValue(input.response, this.secrets);
			}
			this.events.push(event);
		} catch (error) {
			debugLog(this.settings, 'debug-note.record.failed', { error: errorMessage(error) });
		}
	}

	recordTool(name: string, parameters: unknown): void {
		try {
			this.events.push({
				type: 'tool',
				name: redactString(name, this.secrets),
				parameters: redactValue(parameters, this.secrets),
			});
		} catch (error) {
			debugLog(this.settings, 'debug-note.record.failed', { error: errorMessage(error) });
		}
	}

	render(summary: DebugPayload): string {
		return formatDebugNote(summary, this.events);
	}

	async write(app: App, summary: DebugPayload): Promise<void> {
		if (this.written) {
			return;
		}
		this.written = true;
		try {
			const file = await createNote(app, debugNoteFilePath(), this.render(summary));
			this.notePath = file.path;
		} catch (error) {
			this.noteError = errorMessage(error);
			debugLog(this.settings, 'debug-note.write.failed', { error: this.noteError });
		}
	}
}

function configuredSecrets(settings: VaultAssistantSettings): string[] {
	const unique: string[] = [];
	for (const secret of [settings.openaiApiKey, settings.openrouterApiKey, settings.ollamaApiKey]) {
		const trimmed = secret.trim();
		if (!trimmed || unique.includes(trimmed)) {
			continue;
		}
		unique.push(trimmed);
	}
	unique.sort((a, b) => b.length - a.length);
	return unique;
}

function isSensitiveKey(key: string): boolean {
	const normalized = key.toLowerCase().replace(/-/g, '_');
	return SENSITIVE_KEYS.has(normalized);
}

function redactValue(value: unknown, secrets: readonly string[]): unknown {
	if (typeof value === 'string') {
		return redactString(value, secrets);
	}
	if (Array.isArray(value)) {
		return value.map((item) => redactValue(item, secrets));
	}
	if (isRecord(value)) {
		const redacted: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value)) {
			redacted[key] = isSensitiveKey(key) ? '[redacted]' : redactValue(child, secrets);
		}
		return redacted;
	}
	return value;
}

function redactString(value: string, secrets: readonly string[]): string {
	let next = value.replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=]+/gi, '[image data redacted]');
	for (const secret of secrets) {
		if (secret && next.includes(secret)) {
			next = next.split(secret).join('[redacted]');
		}
	}
	return sanitizeErrorText(next);
}

function formatDebugNote(summary: DebugPayload, events: readonly DebugEvent[]): string {
	const parts = ['# Vault Assistant debug', '', '## Summary', formatDebugLines(summary)];
	let requests = 0;
	let tools = 0;
	for (const event of events) {
		parts.push('');
		if (event.type === 'exchange') {
			requests += 1;
			parts.push(`## Request ${requests}`, `api: ${event.api}`, `endpoint: ${event.endpoint}`);
			if (event.httpStatus !== undefined) {
				parts.push(`httpStatus: ${event.httpStatus}`);
			}
			parts.push('', '### Request', jsonBlock(event.request));
			if (event.error !== undefined) {
				parts.push('', '### Error', event.error);
			} else {
				parts.push('', '### Response', jsonBlock(event.response));
			}
			continue;
		}
		tools += 1;
		parts.push(`## Tool call ${tools}`, `name: ${event.name}`, '', '### Parameters', jsonBlock(event.parameters));
	}
	parts.push('');
	return parts.join('\n');
}

function jsonBlock(value: unknown): string {
	let text = '"[unserializable]"';
	try {
		text = JSON.stringify(value, null, 2) ?? 'null';
	} catch {
		text = '"[unserializable]"';
	}
	return ['```json', text, '```'].join('\n');
}

function debugNoteFilePath(now = new Date()): string {
	const pad = (value: number): string => String(value).padStart(2, '0');
	const stamp = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-');
	const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-');
	return `${DEBUG_NOTES_FOLDER}/${stamp} ${time}.md`;
}
