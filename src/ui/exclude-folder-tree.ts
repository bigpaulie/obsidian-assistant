import { setIcon } from 'obsidian';
import type { FolderTreeNode } from '../vault/folders';
import { isFolderExclusionInherited } from '../vault/paths';

export interface ExcludeFolderTreeOptions {
	tree: FolderTreeNode[];
	selected: string[];
	expanded: Set<string>;
	missing: string[];
	onToggle: (path: string) => void;
	onExpandToggle: (path: string) => void;
}

export function renderExcludeFolderTree(parent: HTMLElement, options: ExcludeFolderTreeOptions): void {
	parent.empty();
	const root = parent.createDiv({ cls: 'vault-assistant-folder-tree' });

	if (options.missing.length > 0) {
		const section = root.createDiv({ cls: 'vault-assistant-folder-tree-section' });
		section.createDiv({ cls: 'vault-assistant-folder-tree-heading', text: 'Not in vault' });
		for (const path of options.missing) {
			renderRow(section, { path, name: path, children: [] }, options, 0);
		}
	}

	if (options.tree.length === 0) {
		root.createDiv({ cls: 'vault-assistant-folder-tree-empty', text: 'No folders in this vault.' });
		return;
	}

	const list = root.createDiv({ cls: 'vault-assistant-folder-tree-list' });
	for (const node of options.tree) {
		renderNode(list, node, options, 0);
	}
}

function renderNode(parent: HTMLElement, node: FolderTreeNode, options: ExcludeFolderTreeOptions, depth: number): void {
	renderRow(parent, node, options, depth);
	if (node.children.length === 0 || !options.expanded.has(node.path)) {
		return;
	}
	for (const child of node.children) {
		renderNode(parent, child, options, depth + 1);
	}
}

function renderRow(parent: HTMLElement, node: FolderTreeNode, options: ExcludeFolderTreeOptions, depth: number): void {
	const inherited = isFolderExclusionInherited(node.path, options.selected);
	const checked = inherited || options.selected.includes(node.path);
	const row = parent.createDiv({ cls: 'vault-assistant-folder-tree-row' });
	if (inherited) {
		row.addClass('is-inherited');
	}
	row.style.setProperty('--vault-assistant-folder-depth', String(depth));

	if (node.children.length > 0) {
		const expanded = options.expanded.has(node.path);
		const twistie = row.createEl('button', {
			cls: 'vault-assistant-folder-tree-twistie clickable-icon',
			attr: {
				type: 'button',
				'aria-label': expanded ? 'Collapse folder' : 'Expand folder',
				'aria-expanded': expanded ? 'true' : 'false',
			},
		});
		setIcon(twistie, expanded ? 'chevron-down' : 'chevron-right');
		twistie.addEventListener('click', (event) => {
			event.preventDefault();
			options.onExpandToggle(node.path);
		});
	} else {
		row.createDiv({ cls: 'vault-assistant-folder-tree-twistie-spacer' });
	}

	const label = row.createEl('label', { cls: 'vault-assistant-folder-tree-label' });
	const checkbox = label.createEl('input', {
		type: 'checkbox',
		cls: 'vault-assistant-folder-tree-checkbox',
		attr: {
			'aria-label': `Exclude ${node.name}`,
		},
	});
	checkbox.checked = checked;
	checkbox.disabled = inherited;
	if (inherited) {
		checkbox.title = 'Excluded because a parent folder is excluded';
	}
	checkbox.addEventListener('change', () => {
		options.onToggle(node.path);
	});
	label.createSpan({ text: node.name });
}
