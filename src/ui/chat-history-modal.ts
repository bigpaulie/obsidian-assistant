import { App, FuzzySuggestModal } from 'obsidian';
import type { StoredConversation } from '../chat/history-store';

/** Quick-switcher style picker for saved chat conversations. */
export class ChatHistoryModal extends FuzzySuggestModal<StoredConversation> {
	constructor(
		app: App,
		private readonly conversations: StoredConversation[],
		private readonly onPick: (conversation: StoredConversation) => void,
		private readonly onDismiss?: () => void,
	) {
		super(app);
		this.setPlaceholder('Resume a conversation');
	}

	getItems(): StoredConversation[] {
		return this.conversations;
	}

	getItemText(conversation: StoredConversation): string {
		const title = conversation.title.trim() || 'New chat';
		return `${title} — ${formatConversationTime(conversation.updatedAt)}`;
	}

	onChooseItem(conversation: StoredConversation, _evt: MouseEvent | KeyboardEvent): void {
		this.onPick(conversation);
	}

	onClose(): void {
		this.onDismiss?.();
	}
}

function formatConversationTime(updatedAt: number): string {
	try {
		return new Date(updatedAt).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		});
	} catch {
		return new Date(updatedAt).toISOString();
	}
}
