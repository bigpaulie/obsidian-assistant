import { Component, MarkdownRenderer, Notice } from 'obsidian';
import type { NoteProposal } from '../agent/tools';
import type VaultAssistantPlugin from '../main';
import { createNote, moveNote, readNote, updateNote } from '../vault/notes';
import { applyTextPatch } from '../vault/patch';
import { dirname } from '../vault/paths';

const PATCH_PREVIEW_MAX_CHARS = 400;

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
		text: actionLabel(proposal),
	});
	header.createSpan({ cls: 'vault-assistant-proposal-path', text: pathLabel(proposal) });

	if (proposal.action === 'patch') {
		renderPatchPreview(card, proposal);
	} else if (proposal.action !== 'move') {
		const preview = card.createDiv({ cls: 'vault-assistant-proposal-preview markdown-rendered' });
		void MarkdownRenderer.render(plugin.app, proposal.content, preview, sourcePath, markdownHost);
	}

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
				const file = await applyProposal(plugin, proposal);
				appliedPath = file.path;
				header.querySelector('.vault-assistant-proposal-path')?.setText(file.path);
				new Notice(appliedNotice(proposal.action, file.path));
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

function actionLabel(proposal: NoteProposal): string {
	switch (proposal.action) {
		case 'create':
			return 'Create note';
		case 'update':
			return 'Update note';
		case 'patch':
			return 'Patch note';
		case 'move':
			return 'Move note';
	}
}

function pathLabel(proposal: NoteProposal): string {
	if (proposal.action === 'move') {
		return `${proposal.path} → ${proposal.destination}`;
	}
	return proposal.path;
}

function appliedNotice(action: NoteProposal['action'], path: string): string {
	switch (action) {
		case 'create':
			return `Created ${path}`;
		case 'update':
			return `Updated ${path}`;
		case 'patch':
			return `Patched ${path}`;
		case 'move':
			return `Moved ${path}`;
	}
}

function renderPatchPreview(card: HTMLElement, proposal: Extract<NoteProposal, { action: 'patch' }>): void {
	const preview = card.createDiv({ cls: 'vault-assistant-proposal-preview vault-assistant-proposal-patch' });
	const oldBlock = preview.createDiv({ cls: 'vault-assistant-proposal-patch-block' });
	oldBlock.createDiv({ cls: 'vault-assistant-proposal-patch-label', text: 'Replace' });
	oldBlock.createEl('pre', { cls: 'vault-assistant-proposal-patch-text', text: truncatePatchText(proposal.oldText) });
	const newBlock = preview.createDiv({ cls: 'vault-assistant-proposal-patch-block' });
	newBlock.createDiv({ cls: 'vault-assistant-proposal-patch-label', text: 'With' });
	newBlock.createEl('pre', { cls: 'vault-assistant-proposal-patch-text', text: truncatePatchText(proposal.newText) });
	if (proposal.replaceAll) {
		preview.createDiv({ cls: 'vault-assistant-proposal-patch-meta', text: 'All occurrences' });
	}
}

function truncatePatchText(text: string): string {
	if (text.length <= PATCH_PREVIEW_MAX_CHARS) {
		return text;
	}
	return `${text.slice(0, PATCH_PREVIEW_MAX_CHARS)}…`;
}

async function applyProposal(plugin: VaultAssistantPlugin, proposal: NoteProposal) {
	if (proposal.action === 'move') {
		return moveNote(plugin.app, proposal.path, dirname(proposal.destination));
	}
	if (proposal.action === 'create') {
		return createNote(plugin.app, proposal.path, proposal.content);
	}
	if (proposal.action === 'patch') {
		const content = await readNote(plugin.app, proposal.path);
		const patched = applyTextPatch(content, proposal.oldText, proposal.newText, proposal.replaceAll ?? false);
		if (!patched.ok) {
			throw new Error(patched.error);
		}
		return updateNote(plugin.app, proposal.path, patched.content);
	}
	return updateNote(plugin.app, proposal.path, proposal.content);
}
