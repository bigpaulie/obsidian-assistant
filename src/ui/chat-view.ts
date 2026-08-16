import { Component, ItemView, MarkdownRenderer, Notice, Platform, TFile, WorkspaceLeaf } from 'obsidian';
import { runAgent } from '../agent/loop';
import type { NoteProposal } from '../agent/tools';
import { MAX_REFERENCED_NOTES, VIEW_TYPE_CHAT } from '../constants';
import { errorMessage } from '../llm/client';
import type { ChatMessage } from '../llm/types';
import type VaultAssistantPlugin from '../main';
import { getOpenMarkdownFiles } from '../vault/notes';
import { renderApplyCard } from './apply-card';
import { NoteSuggestModal, wikilinkFor } from './note-suggest';

export class ChatView extends ItemView {
	private messagesEl!: HTMLElement;
	private chipsEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private stopBtn!: HTMLButtonElement;
	private addNoteBtn!: HTMLButtonElement;
	private addOpenNoteBtn!: HTMLButtonElement;
	private messagesHost = new Component();
	private history: ChatMessage[] = [];
	private referenced = new Map<string, TFile>();
	private cancelled = false;
	private running = false;
	private suggestOpen = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: VaultAssistantPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CHAT;
	}

	getDisplayText(): string {
		return 'Vault assistant';
	}

	getIcon(): string {
		return 'message-square';
	}

	async onOpen(): Promise<void> {
		this.addChild(this.messagesHost);
		const root = this.contentEl;
		root.empty();
		root.addClass('vault-assistant-root');

		if (Platform.isMobile) {
			root.addClass('is-mobile');
		}

		const header = root.createDiv({ cls: 'vault-assistant-header' });
		header.createEl('h2', { text: 'Vault assistant' });
		const newChatBtn = header.createEl('button', { text: 'New chat' });
		this.registerDomEvent(newChatBtn, 'click', () => this.resetChat());

		this.messagesEl = root.createDiv({ cls: 'vault-assistant-messages' });
		this.showEmptyState();

		const composer = root.createDiv({ cls: 'vault-assistant-composer' });
		this.chipsEl = composer.createDiv({ cls: 'vault-assistant-chips' });
		this.chipsEl.hide();
		this.inputEl = composer.createEl('textarea', {
			attr: {
				rows: '3',
				placeholder: Platform.isMobile
					? 'Ask about your notes.'
					: 'Ask about your notes. Type [[ to add a note.',
			},
		});
		const buttons = composer.createDiv({ cls: 'vault-assistant-composer-actions' });
		const addGroup = buttons.createDiv({ cls: 'vault-assistant-composer-add' });
		this.addNoteBtn = addGroup.createEl('button', { text: 'Add note' });
		this.addOpenNoteBtn = addGroup.createEl('button', { text: 'Add open note' });
		const sendGroup = buttons.createDiv({ cls: 'vault-assistant-composer-send' });
		this.stopBtn = sendGroup.createEl('button', { text: 'Stop' });
		this.stopBtn.hide();
		this.sendBtn = sendGroup.createEl('button', { cls: 'mod-cta', text: 'Send' });

		this.registerDomEvent(this.addNoteBtn, 'click', () => this.openNotePicker());
		this.registerDomEvent(this.addOpenNoteBtn, 'click', () => this.addOpenNote());
		this.registerDomEvent(this.sendBtn, 'click', () => void this.send());
		this.registerDomEvent(this.stopBtn, 'click', () => this.stop());
		this.registerDomEvent(this.inputEl, 'keydown', (event) => {
			if (Platform.isMobile) {
				return;
			}
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				void this.send();
			}
		});
		this.registerDomEvent(this.inputEl, 'input', () => this.maybeOpenWikiSuggest());
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.updateOpenNoteButton()));
		this.registerEvent(this.app.workspace.on('layout-change', () => this.updateOpenNoteButton()));
		this.updateOpenNoteButton();
	}

	async onClose(): Promise<void> {
		this.stop();
		this.messagesHost.unload();
	}

	private resetChat(): void {
		this.stop();
		this.history = [];
		this.referenced.clear();
		this.renderChips();
		this.rebuildMessagesHost();
		this.messagesEl.empty();
		this.showEmptyState();
	}

	private showEmptyState(): void {
		this.messagesEl.createDiv({
			cls: 'vault-assistant-empty',
			text: 'Ask about your notes, or request a new note. Use add note or add open note to reference specific notes. Proposed writes appear here until you apply them.',
		});
	}

	private rebuildMessagesHost(): void {
		this.removeChild(this.messagesHost);
		this.messagesHost = new Component();
		this.addChild(this.messagesHost);
	}

	private openNotePicker(insert?: { start: number; length: number }): void {
		if (this.suggestOpen || this.running) {
			return;
		}
		this.suggestOpen = true;
		const modal = new NoteSuggestModal(
			this.app,
			this.plugin.settings.excludeFolders,
			(file) => {
				this.addChip(file);
				if (insert) {
					this.insertWikiLink(file, insert.start, insert.length);
				}
			},
			() => {
				this.suggestOpen = false;
			},
		);
		modal.open();
	}

	addOpenNote(): void {
		const files = getOpenMarkdownFiles(this.app);
		if (files.length === 0) {
			new Notice('Open a note tab first.');
			this.updateOpenNoteButton();
			return;
		}
		const only = files[0];
		if (files.length === 1 && only) {
			this.addChip(only);
			return;
		}
		if (this.suggestOpen || this.running) {
			return;
		}
		this.suggestOpen = true;
		const modal = new NoteSuggestModal(
			this.app,
			this.plugin.settings.excludeFolders,
			(file) => this.addChip(file),
			() => {
				this.suggestOpen = false;
			},
			files,
		);
		modal.open();
	}

	private updateOpenNoteButton(): void {
		if (!this.addOpenNoteBtn) {
			return;
		}
		const available = getOpenMarkdownFiles(this.app).length > 0 && !this.running;
		if (available) {
			this.addOpenNoteBtn.removeAttribute('disabled');
		} else {
			this.addOpenNoteBtn.setAttr('disabled', 'true');
		}
	}

	private maybeOpenWikiSuggest(): void {
		if (Platform.isMobile || this.suggestOpen || this.running) {
			return;
		}
		const pos = this.inputEl.selectionStart ?? 0;
		const before = this.inputEl.value.slice(0, pos);
		if (!before.endsWith('[[')) {
			return;
		}
		this.openNotePicker({ start: pos - 2, length: 2 });
	}

	private insertWikiLink(file: TFile, start: number, length: number): void {
		const link = wikilinkFor(this.app, file);
		const value = this.inputEl.value;
		this.inputEl.value = value.slice(0, start) + link + value.slice(start + length);
		const cursor = start + link.length;
		this.inputEl.setSelectionRange(cursor, cursor);
		this.inputEl.focus();
	}

	private addChip(file: TFile): void {
		if (this.referenced.has(file.path)) {
			return;
		}
		if (this.referenced.size >= MAX_REFERENCED_NOTES) {
			new Notice(`You can reference up to ${MAX_REFERENCED_NOTES} notes.`);
			return;
		}
		this.referenced.set(file.path, file);
		this.renderChips();
	}

	private renderChips(): void {
		this.chipsEl.empty();
		if (this.referenced.size === 0) {
			this.chipsEl.hide();
			return;
		}
		this.chipsEl.show();
		for (const file of this.referenced.values()) {
			const chip = this.chipsEl.createDiv({ cls: 'vault-assistant-chip' });
			chip.createSpan({ text: `[[${file.basename}]]` });
			const remove = chip.createEl('button', {
				cls: 'vault-assistant-chip-remove',
				text: '×',
			});
			remove.setAttr('aria-label', 'Remove note');
			remove.addEventListener('click', () => {
				this.referenced.delete(file.path);
				this.renderChips();
			});
		}
	}

	private async send(): Promise<void> {
		if (this.running) {
			return;
		}
		const text = this.inputEl.value.trim();
		if (!text) {
			return;
		}
		if (!this.plugin.settings.privacyAcknowledged) {
			new Notice('Acknowledge the privacy notice in settings before chatting.');
			return;
		}
		if (!this.plugin.settings.model.trim()) {
			new Notice('Choose a model in settings.');
			return;
		}

		this.inputEl.value = '';
		if (this.messagesEl.querySelector('.vault-assistant-empty')) {
			this.messagesEl.empty();
		}
		await this.appendUserMessage(text);

		this.running = true;
		this.cancelled = false;
		this.setBusy(true);
		const status = this.messagesEl.createDiv({ cls: 'vault-assistant-status', text: 'Thinking…' });
		this.scrollToBottom();

		try {
			const result = await runAgent(this.plugin, {
				history: this.history,
				userMessage: text,
				referencedPaths: [...this.referenced.keys()],
				cancelled: () => this.cancelled,
			});
			status.remove();
			if (this.cancelled) {
				this.messagesEl.createDiv({ cls: 'vault-assistant-status', text: 'Stopped.' });
				return;
			}
			this.history = toUiHistory(result.messages);
			await this.appendAssistantMessage(result.assistantText, result.proposals);
		} catch (error) {
			status.remove();
			this.messagesEl.createDiv({
				cls: 'vault-assistant-error',
				text: errorMessage(error),
			});
		} finally {
			this.running = false;
			this.setBusy(false);
			this.scrollToBottom();
		}
	}

	private stop(): void {
		this.cancelled = true;
	}

	private setBusy(busy: boolean): void {
		this.sendBtn.toggle(!busy);
		this.stopBtn.toggle(busy);
		if (busy) {
			this.addNoteBtn.setAttr('disabled', 'true');
			this.addOpenNoteBtn.setAttr('disabled', 'true');
			this.inputEl.setAttr('disabled', 'true');
		} else {
			this.addNoteBtn.removeAttribute('disabled');
			this.inputEl.removeAttribute('disabled');
			this.updateOpenNoteButton();
		}
		this.inputEl.toggleClass('is-disabled', busy);
	}

	private async appendUserMessage(text: string): Promise<void> {
		const bubble = this.messagesEl.createDiv({ cls: 'vault-assistant-msg is-user' });
		bubble.createDiv({ cls: 'vault-assistant-msg-label', text: 'You' });
		bubble.createDiv({ cls: 'vault-assistant-msg-body', text });
		this.scrollToBottom();
	}

	private async appendAssistantMessage(text: string, proposals: NoteProposal[]): Promise<void> {
		const bubble = this.messagesEl.createDiv({ cls: 'vault-assistant-msg is-assistant' });
		bubble.createDiv({ cls: 'vault-assistant-msg-label', text: 'Assistant' });
		const body = bubble.createDiv({ cls: 'vault-assistant-msg-body markdown-rendered' });
		await MarkdownRenderer.render(this.app, text, body, this.markdownSourcePath(), this.messagesHost);
		for (const proposal of proposals) {
			renderApplyCard(this.plugin, this.messagesEl, proposal, this.messagesHost, this.markdownSourcePath());
		}
		this.scrollToBottom();
	}

	private markdownSourcePath(): string {
		return this.plugin.app.workspace.getActiveFile()?.path ?? '';
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}
}

function toUiHistory(messages: ChatMessage[]): ChatMessage[] {
	return messages
		.filter((message) => message.role === 'user' || message.role === 'assistant')
		.filter((message) => !message.tool_calls)
		.map((message) => ({ role: message.role, content: message.content }));
}
