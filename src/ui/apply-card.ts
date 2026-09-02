import { Component, MarkdownRenderer, Notice } from 'obsidian';
import type { NoteProposal } from '../agent/tools';
import type VaultAssistantPlugin from '../main';
import { createNote, moveNote, readNote, updateNote } from '../vault/notes';
import { buildPatchDiffLines, type PatchDiffLine } from '../vault/patch-diff';
import { applyTextPatch } from '../vault/patch';
import { dirname } from '../vault/paths';

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
	const preview = card.createDiv({ cls: 'vault-assistant-proposal-preview vault-assistant-proposal-diff' });
	const diffLines = buildPatchDiffLines(proposal.oldText, proposal.newText);
	for (const line of diffLines) {
		renderPatchDiffLine(preview, line);
	}
	if (proposal.replaceAll) {
		preview.createDiv({ cls: 'vault-assistant-proposal-diff-meta', text: 'All occurrences' });
	}
}

function renderPatchDiffLine(container: HTMLElement, line: PatchDiffLine): void {
	const row = container.createDiv({
		cls: `vault-assistant-proposal-diff-line vault-assistant-proposal-diff-line--${line.kind}`,
	});
	row.createSpan({ cls: 'vault-assistant-proposal-diff-gutter', text: diffGutter(line.kind) });
	row.createSpan({ cls: 'vault-assistant-proposal-diff-text', text: line.text });
}

function diffGutter(kind: PatchDiffLine['kind']): string {
	switch (kind) {
		case 'remove':
			return '-';
		case 'add':
			return '+';
		case 'context':
			return ' ';
	}
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
