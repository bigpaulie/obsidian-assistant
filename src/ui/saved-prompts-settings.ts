import { App, Notice } from 'obsidian';
import type { SavedPrompt, SavedPromptStore } from '../prompts/saved-prompt-store';
import { SavedPromptEditorModal } from './saved-prompt-editor-modal';

export interface SavedPromptsSettingsOptions {
	app: App;
	store: SavedPromptStore;
	onChange: () => void;
}

/** Settings list UI for saved prompts CRUD. */
export async function renderSavedPromptsSettings(
	parent: HTMLElement,
	options: SavedPromptsSettingsOptions,
): Promise<void> {
	parent.empty();
	const root = parent.createDiv({ cls: 'vault-assistant-saved-prompts' });

	const toolbar = root.createDiv({ cls: 'vault-assistant-saved-prompts-toolbar' });
	const addBtn = toolbar.createEl('button', { text: 'Add prompt', cls: 'mod-cta' });
	addBtn.addEventListener('click', () => {
		openEditor(options.app, options.store, undefined, () => {
			options.onChange();
			void renderSavedPromptsSettings(parent, options);
		});
	});

	const prompts = await options.store.list();
	if (prompts.length === 0) {
		root.createDiv({ cls: 'vault-assistant-saved-prompts-empty', text: 'No saved prompts yet.' });
		return;
	}

	const list = root.createDiv({ cls: 'vault-assistant-saved-prompts-list' });
	for (const prompt of prompts) {
		renderPromptRow(list, prompt, options, parent);
	}
}

function renderPromptRow(
	list: HTMLElement,
	prompt: SavedPrompt,
	options: SavedPromptsSettingsOptions,
	parent: HTMLElement,
): void {
	const row = list.createDiv({ cls: 'vault-assistant-saved-prompt-row' });
	const header = row.createDiv({ cls: 'vault-assistant-saved-prompt-header' });
	header.createDiv({ cls: 'vault-assistant-saved-prompt-name', text: prompt.name });
	const actions = header.createDiv({ cls: 'vault-assistant-saved-prompt-actions' });
	const editBtn = actions.createEl('button', { text: 'Edit' });
	const deleteBtn = actions.createEl('button', { text: 'Delete' });
	deleteBtn.classList.add('mod-warning');
	const preview = prompt.content.trim().replace(/\s+/g, ' ').slice(0, 120);
	if (preview) {
		row.createDiv({ cls: 'vault-assistant-saved-prompt-preview', text: preview });
	}

	editBtn.addEventListener('click', () => {
		openEditor(options.app, options.store, prompt, () => {
			options.onChange();
			void renderSavedPromptsSettings(parent, options);
		});
	});

	deleteBtn.addEventListener('click', () => {
		void options.store.delete(prompt.id).then(async () => {
			new Notice('Prompt deleted.');
			options.onChange();
			await renderSavedPromptsSettings(parent, options);
		});
	});
}

function openEditor(
	app: App,
	store: SavedPromptStore,
	prompt: SavedPrompt | undefined,
	onSaved: () => void,
): void {
	const modal = new SavedPromptEditorModal(app, store, { prompt, onSaved });
	modal.open();
}
