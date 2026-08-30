import { Component, ItemView, MarkdownRenderer, Notice, Platform, TFile, WorkspaceLeaf } from 'obsidian';
import { runAgent } from '../agent/loop';
import type { NoteProposal } from '../agent/tools';
import {
	newConversationId,
	type StoredConversation,
} from '../chat/history-store';
import { fallbackTitle, generateConversationTitle } from '../chat/title';
import { MAX_REFERENCED_NOTES, VIEW_TYPE_CHAT } from '../constants';
import { formatDebugLines } from '../debug';
import { formatChatError, LlmError } from '../llm/errors';
import type { ChatMessage } from '../llm/types';
import { formatReplyMeta, type TokenUsage } from '../llm/usage';
import type VaultAssistantPlugin from '../main';
import { getActiveMarkdownPath, getOpenMarkdownFiles } from '../vault/notes';
import { resolveSystemNotePath } from '../vault/system-note';
import { renderApplyCard } from './apply-card';
import { ChatHistoryModal } from './chat-history-modal';
import { composerKeyboardInset, MOBILE_KEYBOARD_INSET_THRESHOLD } from './keyboard-inset';
import { NoteSuggestModal, wikilinkFor } from './note-suggest';

const UNTITLED_CHAT = 'New chat';

export class ChatView extends ItemView {
	private messagesEl!: HTMLElement;
	private chipsEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendBtn!: HTMLButtonElement;
	private stopBtn!: HTMLButtonElement;
	private addNoteBtn!: HTMLButtonElement;
	private addOpenNoteBtn!: HTMLButtonElement;
	private titleEl!: HTMLElement;
	private historyBtn!: HTMLButtonElement;
	private systemSourceEl!: HTMLElement;
	private resolvedSystemNotePath: string | null = null;
	private messagesHost = new Component();
	private history: ChatMessage[] = [];
	private referenced = new Map<string, TFile>();
	private cancelled = false;
	private running = false;
	private suggestOpen = false;
	private restInnerHeight = 0;
	private currentConversationId: string | null = null;
	private currentTitle = '';
	private conversationCreatedAt: number | null = null;
	private titleRequestId = 0;

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
		if (Platform.isPhone) {
			root.addClass('is-phone');
		}

		const header = root.createDiv({ cls: 'vault-assistant-header' });
		this.titleEl = header.createEl('h2', { text: this.headerTitleText() });
		const actions = header.createDiv({ cls: 'vault-assistant-header-actions' });
		this.historyBtn = actions.createEl('button', { text: 'History' });
		this.historyBtn.toggle(this.historyEnabled());
		const newChatBtn = actions.createEl('button', { text: 'New chat' });
		this.registerDomEvent(this.historyBtn, 'click', () => void this.openHistory());
		this.registerDomEvent(newChatBtn, 'click', () => void this.resetChat());

		this.systemSourceEl = root.createDiv({ cls: 'vault-assistant-system-source' });
		this.systemSourceEl.hide();
		this.registerDomEvent(this.systemSourceEl, 'click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement) || !target.closest('a')) {
				return;
			}
			event.preventDefault();
			const path = this.resolvedSystemNotePath;
			if (!path) {
				return;
			}
			const file = this.app.vault.getFileByPath(path);
			if (file) {
				void this.app.workspace.getLeaf(false).openFile(file);
			}
		});

		this.messagesEl = root.createDiv({ cls: 'vault-assistant-messages' });
		this.showEmptyState();

		const composer = root.createDiv({ cls: 'vault-assistant-composer' });
		this.chipsEl = composer.createDiv({ cls: 'vault-assistant-chips' });
		this.chipsEl.hide();
		const field = composer.createDiv({ cls: 'vault-assistant-composer-field' });
		this.inputEl = field.createEl('textarea', {
			attr: {
				rows: '1',
				placeholder: Platform.isMobile
					? 'Ask about your notes.'
					: 'Ask about your notes. Type [[ to add a note.',
				...(Platform.isMobile ? { enterkeyhint: 'enter' } : {}),
			},
		});
		this.stopBtn = field.createEl('button', { text: 'Stop' });
		this.stopBtn.setAttr('aria-label', 'Stop');
		this.stopBtn.hide();
		this.sendBtn = field.createEl('button', { cls: 'mod-cta', text: 'Send' });
		this.sendBtn.setAttr('aria-label', 'Send');
		const buttons = composer.createDiv({ cls: 'vault-assistant-composer-actions' });
		const addGroup = buttons.createDiv({ cls: 'vault-assistant-composer-add' });
		this.addNoteBtn = addGroup.createEl('button', { text: 'Add note' });
		this.addOpenNoteBtn = addGroup.createEl('button', { text: 'Add open note' });

		this.registerDomEvent(this.addNoteBtn, 'click', () => this.openNotePicker());
		this.registerDomEvent(this.addOpenNoteBtn, 'click', () => this.addOpenNote());
		this.registerDomEvent(this.sendBtn, 'pointerdown', (event) => event.preventDefault());
		this.registerDomEvent(this.stopBtn, 'pointerdown', (event) => event.preventDefault());
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
		this.registerDomEvent(this.inputEl, 'input', () => {
			this.syncComposerHeight();
			this.maybeOpenWikiSuggest();
		});
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.updateOpenNoteButton();
			this.updateSystemSource();
		}));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.updateOpenNoteButton();
			this.updateSystemSource();
			this.syncMobileKeyboard();
		}));
		this.setupMobileKeyboard();
		this.updateOpenNoteButton();
		this.updateSystemSource();
		this.syncComposerHeight();
	}

	async onClose(): Promise<void> {
		this.stop();
		if (this.historyEnabled() && this.history.length > 0) {
			await this.persistCurrentConversation(true);
		}
		this.messagesHost.unload();
		this.containerEl.style.removeProperty('--vault-assistant-keyboard-inset');
		this.contentEl.removeClass('is-keyboard-open');
	}

	private historyEnabled(): boolean {
		return this.plugin.settings.chatHistoryEnabled;
	}

	private headerTitleText(): string {
		if (!this.historyEnabled()) {
			return 'Vault assistant';
		}
		return this.currentTitle.trim() || UNTITLED_CHAT;
	}

	private syncHeaderTitle(): void {
		if (!this.titleEl) {
			return;
		}
		this.titleEl.setText(this.headerTitleText());
		if (this.historyBtn) {
			this.historyBtn.toggle(this.historyEnabled());
		}
	}

	private async resetChat(): Promise<void> {
		this.stop();
		if (this.historyEnabled() && this.history.length > 0) {
			await this.persistCurrentConversation(true);
		}
		this.titleRequestId += 1;
		this.currentConversationId = null;
		this.currentTitle = '';
		this.conversationCreatedAt = null;
		this.history = [];
		this.referenced.clear();
		this.renderChips();
		this.rebuildMessagesHost();
		this.messagesEl.empty();
		this.showEmptyState();
		this.syncHeaderTitle();
	}

	private async openHistory(): Promise<void> {
		if (!this.historyEnabled() || this.running || this.suggestOpen) {
			return;
		}
		const conversations = await this.plugin.chatHistory.list();
		if (conversations.length === 0) {
			new Notice('No saved conversations yet.');
			return;
		}
		this.suggestOpen = true;
		const modal = new ChatHistoryModal(
			this.app,
			conversations,
			(conversation) => {
				void this.loadConversation(conversation);
			},
			() => {
				this.suggestOpen = false;
			},
		);
		modal.open();
	}

	private async loadConversation(conversation: StoredConversation): Promise<void> {
		this.stop();
		if (this.historyEnabled() && this.history.length > 0 && this.currentConversationId !== conversation.id) {
			await this.persistCurrentConversation(true);
		}
		this.titleRequestId += 1;
		this.currentConversationId = conversation.id;
		this.currentTitle = conversation.title;
		this.conversationCreatedAt = conversation.createdAt;
		this.history = conversation.messages.map((message) => ({
			role: message.role,
			content: message.content,
		}));
		this.referenced.clear();
		for (const path of conversation.referencedPaths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				this.referenced.set(file.path, file);
			}
		}
		this.renderChips();
		this.rebuildMessagesHost();
		this.messagesEl.empty();
		if (this.history.length === 0) {
			this.showEmptyState();
		} else {
			for (const message of this.history) {
				const text = typeof message.content === 'string' ? message.content : '';
				if (message.role === 'user') {
					await this.appendUserMessage(text);
				} else if (message.role === 'assistant') {
					await this.appendAssistantMessage(text, []);
				}
			}
		}
		this.syncHeaderTitle();
		this.scrollToBottom();
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

	private updateSystemSource(): void {
		if (!this.systemSourceEl) {
			return;
		}
		const path = resolveSystemNotePath(this.app, getActiveMarkdownPath(this.app));
		this.resolvedSystemNotePath = path;
		this.systemSourceEl.empty();
		if (!path) {
			this.systemSourceEl.hide();
			return;
		}
		this.systemSourceEl.show();
		this.systemSourceEl.createSpan({ text: 'System note: ' });
		this.systemSourceEl.createEl('a', {
			text: path,
			cls: 'vault-assistant-system-source-link',
			attr: { href: '#' },
		});
	}

	private setupMobileKeyboard(): void {
		if (!Platform.isMobile) {
			return;
		}
		this.restInnerHeight = window.innerHeight;
		const sync = (): void => this.syncMobileKeyboard();
		const vv = window.visualViewport;
		if (vv) {
			vv.addEventListener('resize', sync);
			vv.addEventListener('scroll', sync);
			this.register(() => {
				vv.removeEventListener('resize', sync);
				vv.removeEventListener('scroll', sync);
			});
		}
		const keyboardObserver = new MutationObserver(sync);
		keyboardObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['style'],
		});
		this.register(() => keyboardObserver.disconnect());
		this.registerDomEvent(window, 'orientationchange', () => {
			window.setTimeout(() => {
				if (this.inputEl !== document.activeElement) {
					this.restInnerHeight = window.innerHeight;
				}
				sync();
			}, 300);
		});
		this.registerDomEvent(this.inputEl, 'focus', () => {
			sync();
		});
		this.registerDomEvent(this.inputEl, 'blur', () => {
			sync();
		});
		this.registerDomEvent(this.messagesEl, 'click', () => {
			this.inputEl.blur();
		});
		sync();
	}

	private syncMobileKeyboard(): void {
		if (!Platform.isMobile) {
			return;
		}
		const inset = this.mobileKeyboardInset();
		const open = inset > MOBILE_KEYBOARD_INSET_THRESHOLD;
		this.contentEl.toggleClass('is-keyboard-open', open);
		if (open) {
			this.containerEl.style.setProperty('--vault-assistant-keyboard-inset', `${inset}px`);
			this.scrollToBottom();
		} else {
			this.containerEl.style.removeProperty('--vault-assistant-keyboard-inset');
			if (this.inputEl !== document.activeElement) {
				this.restInnerHeight = window.innerHeight;
			}
		}
	}

	private mobileKeyboardInset(): number {
		const vv = window.visualViewport;
		const obsidianKeyboardHeight =
			parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;
		return composerKeyboardInset({
			innerHeight: window.innerHeight,
			restInnerHeight: this.restInnerHeight || window.innerHeight,
			visualViewportHeight: vv?.height,
			visualViewportOffsetTop: vv?.offsetTop,
			obsidianKeyboardHeight,
			containerBottom: this.containerEl.getBoundingClientRect().bottom,
		});
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
		this.syncComposerHeight();
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
		this.syncComposerHeight();
		if (Platform.isMobile) {
			this.inputEl.blur();
		}
		if (this.messagesEl.querySelector('.vault-assistant-empty')) {
			this.messagesEl.empty();
		}
		await this.appendUserMessage(text);

		this.running = true;
		this.cancelled = false;
		this.setBusy(true);
		let statusText = 'Thinking…';
		const startedAt = Date.now();
		const status = this.messagesEl.createDiv({ cls: 'vault-assistant-status is-pending', text: statusText });
		status.setAttr('role', 'status');
		status.setAttr('aria-live', 'polite');
		status.setAttr('aria-busy', 'true');
		const renderStatus = (): void => {
			if (!this.plugin.settings.debugMode) {
				status.setText(statusText);
				return;
			}
			const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
			status.setText(`${statusText} (${elapsed}s)`);
		};
		const timer = window.setInterval(renderStatus, 1000);
		renderStatus();
		this.scrollToBottom();

		try {
			const result = await runAgent(this.plugin, {
				history: this.history,
				userMessage: text,
				referencedPaths: [...this.referenced.keys()],
				cancelled: () => this.cancelled,
				onStatus: (next) => {
					statusText = next;
					renderStatus();
					this.scrollToBottom();
				},
			});
			status.remove();
			if (this.cancelled) {
				this.messagesEl.createDiv({ cls: 'vault-assistant-status', text: 'Stopped.' });
				return;
			}
			this.history = toUiHistory(result.messages);
			await this.appendAssistantMessage(result.assistantText, result.proposals, {
				thinking: result.thinking,
				model: result.model,
				usage: result.usage,
			});
			if (this.plugin.settings.debugMode) {
				this.appendStatusCard('Debug', formatDebugLines(result.debug), {
					copied: 'Copied debug details.',
				});
			}
			if (this.historyEnabled()) {
				await this.afterSuccessfulTurn(result.assistantText);
			}
		} catch (error) {
			status.remove();
			try {
				this.appendError(error);
			} catch {
				this.messagesEl.createDiv({
					cls: 'vault-assistant-status',
					text: error instanceof Error ? error.message : String(error),
				});
			}
		} finally {
			window.clearInterval(timer);
			this.running = false;
			this.setBusy(false);
			this.scrollToBottom();
		}
	}

	private async afterSuccessfulTurn(assistantText: string): Promise<void> {
		const needsTitle = !this.currentTitle.trim();
		if (!this.currentConversationId) {
			this.currentConversationId = newConversationId();
			this.conversationCreatedAt = Date.now();
		}
		await this.persistCurrentConversation(false);
		if (needsTitle) {
			this.beginTitleGeneration(assistantText);
		}
	}

	private beginTitleGeneration(assistantText: string): void {
		const requestId = ++this.titleRequestId;
		const conversationId = this.currentConversationId;
		const firstUser = this.history.find((message) => message.role === 'user');
		const userText = typeof firstUser?.content === 'string' ? firstUser.content : '';
		if (!conversationId || !userText.trim()) {
			return;
		}
		void generateConversationTitle(this.plugin.settings, userText, assistantText).then(async (title) => {
			if (requestId !== this.titleRequestId || this.currentConversationId !== conversationId) {
				return;
			}
			this.currentTitle = title || fallbackTitle(userText);
			this.syncHeaderTitle();
			await this.persistCurrentConversation(false);
		});
	}

	private async persistCurrentConversation(immediate: boolean): Promise<void> {
		if (!this.historyEnabled() || this.history.length === 0) {
			return;
		}
		if (!this.currentConversationId) {
			this.currentConversationId = newConversationId();
		}
		const now = Date.now();
		const createdAt = this.conversationCreatedAt ?? now;
		this.conversationCreatedAt = createdAt;
		const conversation: StoredConversation = {
			id: this.currentConversationId,
			title: this.currentTitle,
			createdAt,
			updatedAt: now,
			messages: this.history.map((message) => ({
				role: message.role,
				content: message.content,
			})),
			referencedPaths: [...this.referenced.keys()],
		};
		if (immediate) {
			await this.plugin.chatHistory.upsertNow(conversation);
		} else {
			await this.plugin.chatHistory.upsert(conversation);
		}
	}

	private appendError(error: unknown): void {
		let summary = 'Something went wrong.';
		let detail: string | undefined;
		try {
			const formatted = formatChatError(error);
			summary = formatted.summary.trim() || summary;
			detail = formatted.detail;
		} catch {
			summary = error instanceof Error ? error.message : String(error);
		}
		const status = error instanceof LlmError ? error.status : undefined;
		const extra = error instanceof LlmError ? error.debug : undefined;
		const lines = [
			summary,
			status ? `HTTP ${status}` : '',
			detail && detail !== summary ? detail : '',
			this.plugin.settings.debugMode && extra ? formatDebugLines(extra) : '',
		].filter((line) => line.length > 0);
		this.appendStatusCard('Error', lines.join('\n\n'), {
			notice: summary,
			copied: 'Copied error details.',
		});
	}

	private appendStatusCard(
		label: string,
		text: string,
		options?: { notice?: string; copied?: string },
	): void {
		if (options?.notice) {
			new Notice(options.notice, 15000);
		}
		const card = this.messagesEl.createDiv({ cls: 'vault-assistant-status' });
		card.createDiv({ cls: 'vault-assistant-msg-label', text: label });
		const log = card.createEl('pre', { cls: 'vault-assistant-log' });
		log.setText(text);
		const copy = card.createEl('button', { text: 'Copy details' });
		this.registerDomEvent(copy, 'click', () => {
			void window.navigator.clipboard.writeText(text).then(
				() => new Notice(options?.copied ?? 'Copied details.'),
				() => new Notice(text, 20000),
			);
		});
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

	private syncComposerHeight(): void {
		this.inputEl.style.removeProperty('height');
		this.inputEl.style.height = `${this.inputEl.scrollHeight}px`;
	}

	private async appendUserMessage(text: string): Promise<void> {
		const bubble = this.messagesEl.createDiv({ cls: 'vault-assistant-msg is-user' });
		bubble.createDiv({ cls: 'vault-assistant-msg-label', text: 'You' });
		bubble.createDiv({ cls: 'vault-assistant-msg-body', text });
		this.scrollToBottom();
	}

	private async appendAssistantMessage(
		text: string,
		proposals: NoteProposal[],
		meta?: { thinking?: string; model?: string; usage?: TokenUsage },
	): Promise<void> {
		const bubble = this.messagesEl.createDiv({ cls: 'vault-assistant-msg is-assistant' });
		bubble.createDiv({ cls: 'vault-assistant-msg-label', text: 'Assistant' });
		this.renderThinking(bubble, meta?.thinking);
		const body = bubble.createDiv({ cls: 'vault-assistant-msg-body markdown-rendered' });
		await MarkdownRenderer.render(this.app, text, body, this.markdownSourcePath(), this.messagesHost);
		if (meta) {
			this.renderReplyMeta(bubble, meta.model, meta.usage);
		}
		for (const proposal of proposals) {
			renderApplyCard(this.plugin, this.messagesEl, proposal, this.messagesHost, this.markdownSourcePath());
		}
		this.scrollToBottom();
	}

	private renderThinking(bubble: HTMLElement, thinking?: string): void {
		const text = thinking?.trim() ?? '';
		if (!text) {
			return;
		}
		const details = bubble.createEl('details', { cls: 'vault-assistant-thinking' });
		details.createEl('summary', { text: 'Thinking' });
		details.createDiv({ cls: 'vault-assistant-thinking-body', text });
		details.open = false;
	}

	private renderReplyMeta(bubble: HTMLElement, model?: string, usage?: TokenUsage): void {
		if (!this.plugin.settings.showReplyMeta) {
			return;
		}
		const line = formatReplyMeta(model ?? this.plugin.settings.model, usage);
		if (!line) {
			return;
		}
		bubble.createDiv({ cls: 'vault-assistant-msg-meta', text: line });
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
