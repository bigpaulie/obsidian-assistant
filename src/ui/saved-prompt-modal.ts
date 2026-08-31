import { App, FuzzySuggestModal } from 'obsidian';
import type { SavedPrompt } from '../prompts/saved-prompt-store';

/** Quick-switcher style picker for saved chat prompts. */
export class SavedPromptModal extends FuzzySuggestModal<SavedPrompt> {
	constructor(
		app: App,
		private readonly prompts: SavedPrompt[],
		private readonly onPick: (prompt: SavedPrompt) => void,
		private readonly onDismiss?: () => void,
	) {
		super(app);
		this.setPlaceholder('Choose a saved prompt');
	}

	getItems(): SavedPrompt[] {
		return this.prompts;
	}

	getItemText(prompt: SavedPrompt): string {
		const preview = prompt.content.trim().replace(/\s+/g, ' ').slice(0, 60);
		return preview ? `${prompt.name} — ${preview}` : prompt.name;
	}

	onChooseItem(prompt: SavedPrompt, _evt: MouseEvent | KeyboardEvent): void {
		this.onPick(prompt);
	}

	onClose(): void {
		this.onDismiss?.();
	}
}
