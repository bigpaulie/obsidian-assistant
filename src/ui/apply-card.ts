import { Component, MarkdownRenderer, Notice } from 'obsidian';
import type { NoteProposal } from '../agent/tools';
import type VaultAssistantPlugin from '../main';
import { createNote, updateNote } from '../vault/notes';

export function renderApplyCard(
	plugin: VaultAssistantPlugin,
	parent: HTMLElement,
	proposal: NoteProposal,
	markdownHost: Component,
	sourcePath: string,
): void {
	const card = parent.createDiv({ cls: 'vault-assistant-proposal' });
	const header = card.createDiv({ cls: 'vault-assistant-proposal-header' });
	header.createSpan({
		cls: 'vault-assistant-proposal-action',
		text: proposal.action === 'create' ? 'Create note' : 'Update note',
	});
	header.createSpan({ cls: 'vault-assistant-proposal-path', text: proposal.path });

	const preview = card.createDiv({ cls: 'vault-assistant-proposal-preview markdown-rendered' });
	void MarkdownRenderer.render(plugin.app, proposal.content, preview, sourcePath, markdownHost);

	const actions = card.createDiv({ cls: 'vault-assistant-proposal-actions' });
	const applyBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Apply' });
	const dismissBtn = actions.createEl('button', { text: 'Dismiss' });
	const openBtn = actions.createEl('button', { text: 'Open note' });
	openBtn.hide();

	let appliedPath: string | null = null;

	applyBtn.addEventListener('click', () => {
		void (async () => {
			applyBtn.setAttr('disabled', 'true');
			try {
				if (proposal.action === 'create') {
					const file = await createNote(plugin.app, proposal.path, proposal.content);
					appliedPath = file.path;
					header.querySelector('.vault-assistant-proposal-path')?.setText(file.path);
					new Notice(`Created ${file.path}`);
				} else {
					const file = await updateNote(plugin.app, proposal.path, proposal.content);
					appliedPath = file.path;
					new Notice(`Updated ${file.path}`);
				}
				applyBtn.setText('Applied');
				dismissBtn.hide();
				openBtn.show();
			} catch (error) {
				applyBtn.removeAttribute('disabled');
				const message = error instanceof Error ? error.message : 'Unable to apply change.';
				new Notice(message);
			}
		})();
	});

	dismissBtn.addEventListener('click', () => {
		card.addClass('is-dismissed');
		applyBtn.setAttr('disabled', 'true');
		dismissBtn.setAttr('disabled', 'true');
	});

	openBtn.addEventListener('click', () => {
		if (!appliedPath) {
			return;
		}
		const file = plugin.app.vault.getFileByPath(appliedPath);
		if (file) {
			void plugin.app.workspace.getLeaf(false).openFile(file);
		}
	});
}
