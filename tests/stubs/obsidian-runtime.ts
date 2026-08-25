/** Runtime stub for Vitest. The npm `obsidian` package is types-only. */

export function normalizePath(path: string): string {
	const unified = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
	if (unified === '/') {
		return '/';
	}
	return unified.replace(/\/$/, '');
}

export class App {}
export class TFile {}
export class TAbstractFile {}
export class TFolder extends TAbstractFile {}
export class MarkdownView {}
export class Notice {}
export class Plugin {}
export class Component {}
export class ItemView {}
export class PluginSettingTab {}
export class Setting {}
export class FuzzySuggestModal {}
export class WorkspaceLeaf {}

export function setIcon(): void {
	return;
}

export function requestUrl(): never {
	throw new Error('requestUrl is not stubbed for this test slice');
}

export const Platform = { isMobile: false };

export const MarkdownRenderer = {
	render: async (): Promise<void> => undefined,
};
