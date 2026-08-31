import { App, Modal, Notice } from 'obsidian';
import { newPromptId, type SavedPrompt, type SavedPromptStore } from '../prompts/saved-prompt-store';

export interface SavedPromptEditorOptions {
	prompt?: SavedPrompt;
	onSaved: () => void;
}

/** Modal to create or edit a saved prompt. */
export class SavedPromptEditorModal extends Modal {
	private name = '';
	private content = '';

	constructor(
		app: App,
		private readonly store: SavedPromptStore,
		private readonly options: SavedPromptEditorOptions,
	) {
		super(app);
		if (options.prompt) {
			this.name = options.prompt.name;
			this.content = options.prompt.content;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', {
			text: this.options.prompt ? 'Edit saved prompt' : 'New saved prompt',
		});

		const nameRow = contentEl.createDiv({ cls: 'vault-assistant-prompt-editor-row' });
		nameRow.createEl('label', { text: 'Name', attr: { for: 'vault-assistant-prompt-name' } });
		const nameInput = nameRow.createEl('input', {
			type: 'text',
			cls: 'vault-assistant-prompt-editor-name',
			attr: { id: 'vault-assistant-prompt-name', maxlength: '80' },
		});
		nameInput.value = this.name;
		nameInput.placeholder = 'Summarize note';

		const contentRow = contentEl.createDiv({ cls: 'vault-assistant-prompt-editor-row' });
		contentRow.createEl('label', { text: 'Prompt', attr: { for: 'vault-assistant-prompt-content' } });
		const contentInput = contentRow.createEl('textarea', {
			cls: 'vault-assistant-prompt-editor-content',
			attr: { id: 'vault-assistant-prompt-content', rows: '6' },
		});
		contentInput.value = this.content;
		contentInput.placeholder = 'Summarize the attached notes in three bullet points…';

		const buttons = contentEl.createDiv({ cls: 'vault-assistant-prompt-editor-buttons' });
		const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
		const saveBtn = buttons.createEl('button', { cls: 'mod-cta', text: 'Save' });

		cancelBtn.addEventListener('click', () => this.close());
		saveBtn.addEventListener('click', () => {
			void this.save(nameInput.value, contentInput.value);
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(rawName: string, rawContent: string): Promise<void> {
		const name = rawName.trim();
		const content = rawContent.trim();
		if (!name) {
			new Notice('Enter a prompt name.');
			return;
		}
		if (name.length > 80) {
			new Notice('Prompt name must be 80 characters or fewer.');
			return;
		}
		if (!content) {
			new Notice('Enter prompt text.');
			return;
		}

		const existing = await this.store.list();
		const duplicate = existing.find(
			(item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== this.options.prompt?.id,
		);
		if (duplicate) {
			new Notice('A prompt with this name already exists.');
			return;
		}

		const prompt: SavedPrompt = {
			id: this.options.prompt?.id ?? newPromptId(),
			name,
			content,
			updatedAt: Date.now(),
		};
		await this.store.upsert(prompt);
		this.options.onSaved();
		this.close();
		new Notice(this.options.prompt ? 'Prompt updated.' : 'Prompt saved.');
	}
}
