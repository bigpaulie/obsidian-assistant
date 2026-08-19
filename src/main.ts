import { Notice, Plugin } from 'obsidian';
import { VIEW_TYPE_CHAT } from './constants';
import { VaultIndexer } from './rag/indexer';
import { DEFAULT_SETTINGS, type VaultAssistantSettings } from './settings';
import { ChatView } from './ui/chat-view';
import { VaultAssistantSettingTab } from './ui/settings-tab';
import { getOpenMarkdownFiles } from './vault/notes';

export default class VaultAssistantPlugin extends Plugin {
	settings!: VaultAssistantSettings;
	indexer!: VaultIndexer;

	async onload(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<VaultAssistantSettings>);
		this.indexer = new VaultIndexer(this);

		this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

		this.addRibbonIcon('message-square', 'Open chat', () => {
			void this.activateChatView();
		});

		this.addCommand({
			id: 'open-chat',
			name: 'Open chat',
			callback: () => {
				void this.activateChatView();
			},
		});

		this.addCommand({
			id: 'add-open-note',
			name: 'Add open note',
			checkCallback: (checking) => {
				if (getOpenMarkdownFiles(this.app).length === 0) {
					return false;
				}
				if (!checking) {
					void this.addOpenNoteFromCommand();
				}
				return true;
			},
		});

		this.addCommand({
			id: 'rebuild-index',
			name: 'Rebuild search index',
			callback: () => {
				void this.indexer.rebuild().then(
					() => {
						new Notice(`Indexed ${this.indexer.chunkCount} chunks.`);
					},
					(error: unknown) => {
						new Notice(error instanceof Error ? error.message : 'Unable to rebuild index.');
					},
				);
			},
		});

		this.addSettingTab(new VaultAssistantSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			void this.indexer.start();
		});
	}

	onunload(): void {
		this.indexer.unload();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateChatView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
		const first = existing[0];
		if (first) {
			await workspace.revealLeaf(first);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (!leaf) {
			return;
		}
		await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
		await workspace.revealLeaf(leaf);
	}

	private async addOpenNoteFromCommand(): Promise<void> {
		await this.activateChatView();
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)) {
			if (leaf.view instanceof ChatView) {
				leaf.view.addOpenNote();
				return;
			}
		}
	}
}
