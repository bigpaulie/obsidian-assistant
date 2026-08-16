import { App, FuzzySuggestModal, TFile } from 'obsidian';
import { isExcludedPath, parseExcludeFolders } from '../vault/paths';

/** Quick-switcher style picker for markdown notes in the vault. */
export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly excludeFoldersRaw: string,
		private readonly onPick: (file: TFile) => void,
		private readonly onDismiss?: () => void,
		private readonly items?: TFile[],
	) {
		super(app);
		this.setPlaceholder(items ? 'Select an open note' : 'Select a note');
	}

	getItems(): TFile[] {
		if (this.items) {
			return this.items;
		}
		const exclude = parseExcludeFolders(this.excludeFoldersRaw);
		const configDir = this.app.vault.configDir;
		return this.app.vault.getMarkdownFiles().filter((file) => !isExcludedPath(file.path, exclude, configDir));
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.onPick(file);
	}

	onClose(): void {
		this.onDismiss?.();
	}
}

/** Wikilink text for a file: basename if unique, otherwise path without `.md`. */
export function wikilinkFor(app: App, file: TFile): string {
	const duplicates = app.vault.getMarkdownFiles().filter((other) => other.basename === file.basename);
	if (duplicates.length <= 1) {
		return `[[${file.basename}]]`;
	}
	const path = file.path.replace(/\.md$/i, '');
	return `[[${path}]]`;
}
