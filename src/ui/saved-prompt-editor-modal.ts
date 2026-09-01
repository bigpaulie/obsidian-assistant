import { App, Modal, Notice, Platform } from 'obsidian';
import { newPromptId, type SavedPrompt, type SavedPromptStore } from '../prompts/saved-prompt-store';
import {
	MOBILE_KEYBOARD_INSET_THRESHOLD,
	modalKeyboardContainerInset,
	mobileVisibleViewportHeight,
} from './keyboard-inset';

export interface SavedPromptEditorOptions {
	prompt?: SavedPrompt;
	onSaved: () => void;
}

const MOBILE_MODAL_TOP_MARGIN = 16;
const MOBILE_MODAL_KEYBOARD_MARGIN = 8;

/** Modal to create or edit a saved prompt. */
export class SavedPromptEditorModal extends Modal {
	private name = '';
	private content = '';
	private mobileCleanups: Array<() => void> = [];
	private mobileFocusSyncTimers: number[] = [];
	private mobileKeyboardSyncRaf: number | null = null;
	private mobileInputs: Array<HTMLInputElement | HTMLTextAreaElement> = [];
	private mobileButtonsEl: HTMLElement | null = null;
	private restInnerHeight = 0;

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
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('vault-assistant-prompt-editor-modal');
		contentEl.addClass('vault-assistant-prompt-editor-body');
		this.containerEl.addClass('vault-assistant-prompt-editor-container');

		const titleEl = contentEl.createEl('h2', {
			text: this.options.prompt ? 'Edit saved prompt' : 'New saved prompt',
		});

		const scrollEl = contentEl.createDiv({ cls: 'vault-assistant-prompt-editor-scroll' });

		const nameRow = scrollEl.createDiv({ cls: 'vault-assistant-prompt-editor-row' });
		nameRow.createEl('label', { text: 'Name', attr: { for: 'vault-assistant-prompt-name' } });
		const nameInput = nameRow.createEl('input', {
			type: 'text',
			cls: 'vault-assistant-prompt-editor-name',
			attr: { id: 'vault-assistant-prompt-name', maxlength: '80' },
		});
		nameInput.value = this.name;
		nameInput.placeholder = 'Summarize note';

		const contentRow = scrollEl.createDiv({ cls: 'vault-assistant-prompt-editor-row' });
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

		if (Platform.isMobile) {
			this.mobileInputs = [nameInput, contentInput];
			this.mobileButtonsEl = buttons;
			this.setupMobileKeyboard(titleEl);
		}
	}

	onClose(): void {
		for (const cleanup of this.mobileCleanups) {
			cleanup();
		}
		this.mobileCleanups = [];
		for (const timer of this.mobileFocusSyncTimers) {
			window.clearTimeout(timer);
		}
		this.mobileFocusSyncTimers = [];
		this.mobileInputs = [];
		this.mobileButtonsEl = null;
		if (this.mobileKeyboardSyncRaf !== null) {
			window.cancelAnimationFrame(this.mobileKeyboardSyncRaf);
			this.mobileKeyboardSyncRaf = null;
		}
		this.modalEl.removeClass('vault-assistant-prompt-editor-modal');
		this.modalEl.style.removeProperty('max-height');
		this.containerEl.removeClass('vault-assistant-prompt-editor-container');
		this.containerEl.removeClass('is-keyboard-open');
		this.containerEl.style.removeProperty('--vault-assistant-modal-keyboard-inset');
		this.contentEl.empty();
		this.contentEl.removeClass('vault-assistant-prompt-editor-body');
	}

	private setupMobileKeyboard(titleEl: HTMLElement): void {
		this.restInnerHeight = window.innerHeight;

		const sync = (): void => this.scheduleMobileKeyboardSync();
		const vv = window.visualViewport;
		if (vv) {
			vv.addEventListener('resize', sync);
			vv.addEventListener('scroll', sync);
			this.mobileCleanups.push(() => {
				vv.removeEventListener('resize', sync);
				vv.removeEventListener('scroll', sync);
			});
		}

		const keyboardObserver = new MutationObserver(sync);
		keyboardObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['style'],
		});
		this.mobileCleanups.push(() => keyboardObserver.disconnect());

		const onOrientationChange = (): void => {
			window.setTimeout(() => {
				if (!this.isMobileInputFocused()) {
					this.restInnerHeight = window.innerHeight;
				}
				sync();
			}, 300);
		};
		window.addEventListener('orientationchange', onOrientationChange);
		this.mobileCleanups.push(() => {
			window.removeEventListener('orientationchange', onOrientationChange);
		});

		const onTitleClick = (): void => {
			(document.activeElement as HTMLElement | null)?.blur();
		};
		titleEl.addEventListener('click', onTitleClick);
		this.mobileCleanups.push(() => titleEl.removeEventListener('click', onTitleClick));

		for (const input of this.mobileInputs) {
			const onFocus = (): void => {
				this.scheduleMobileFocusSync();
				window.requestAnimationFrame(() => {
					this.mobileButtonsEl?.scrollIntoView({ block: 'nearest' });
				});
			};
			const onBlur = (): void => {
				sync();
			};
			input.addEventListener('focus', onFocus);
			input.addEventListener('blur', onBlur);
			this.mobileCleanups.push(() => {
				input.removeEventListener('focus', onFocus);
				input.removeEventListener('blur', onBlur);
			});
		}

		sync();
	}

	private isMobileInputFocused(): boolean {
		return this.mobileInputs.some((input) => input === document.activeElement);
	}

	private scheduleMobileFocusSync(): void {
		this.scheduleMobileKeyboardSync();
		window.requestAnimationFrame(() => {
			this.scheduleMobileKeyboardSync();
		});
		for (const delay of [100, 300]) {
			const timer = window.setTimeout(() => {
				this.mobileFocusSyncTimers = this.mobileFocusSyncTimers.filter((id) => id !== timer);
				this.scheduleMobileKeyboardSync();
			}, delay);
			this.mobileFocusSyncTimers.push(timer);
		}
	}

	private scheduleMobileKeyboardSync(): void {
		if (this.mobileKeyboardSyncRaf !== null) {
			window.cancelAnimationFrame(this.mobileKeyboardSyncRaf);
		}
		this.mobileKeyboardSyncRaf = window.requestAnimationFrame(() => {
			this.mobileKeyboardSyncRaf = null;
			this.syncMobileKeyboard();
		});
	}

	private syncMobileKeyboard(): void {
		const obsidianKeyboardHeight =
			parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;
		const vv = window.visualViewport;
		const focused = this.isMobileInputFocused();
		const keyboardReported = obsidianKeyboardHeight > MOBILE_KEYBOARD_INSET_THRESHOLD;
		const viewportInput = {
			innerHeight: window.innerHeight,
			restInnerHeight: this.restInnerHeight || window.innerHeight,
			visualViewportHeight: vv?.height,
			visualViewportOffsetTop: vv?.offsetTop,
			obsidianKeyboardHeight,
			forceKeyboardOpen: focused && keyboardReported,
		};

		const inset = modalKeyboardContainerInset({
			...viewportInput,
			margin: MOBILE_MODAL_KEYBOARD_MARGIN,
		});
		const keyboardOpen = inset > 0;

		if (keyboardOpen) {
			this.containerEl.addClass('is-keyboard-open');
			this.containerEl.style.setProperty('--vault-assistant-modal-keyboard-inset', `${inset}px`);
			const height = mobileVisibleViewportHeight(viewportInput);
			this.modalEl.style.maxHeight = `${Math.max(0, height - MOBILE_MODAL_TOP_MARGIN)}px`;
			return;
		}

		this.containerEl.removeClass('is-keyboard-open');
		this.containerEl.style.removeProperty('--vault-assistant-modal-keyboard-inset');
		this.modalEl.style.removeProperty('max-height');
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
