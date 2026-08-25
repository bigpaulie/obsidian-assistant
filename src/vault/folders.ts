import { TFolder, normalizePath } from 'obsidian';

export interface FolderTreeNode {
	path: string;
	name: string;
	children: FolderTreeNode[];
}

/** Vault folders under `root`, skipping the config dir. Empty folders are included. */
export function collectFolderTree(root: TFolder, configDir: string): FolderTreeNode[] {
	const config = normalizePath(configDir);
	return folderChildren(root)
		.filter((folder) => folder.path !== config && !folder.path.startsWith(`${config}/`))
		.map((folder) => ({
			path: folder.path,
			name: folder.name,
			children: collectFolderTree(folder, configDir),
		}));
}

export function existingFolderPaths(nodes: FolderTreeNode[]): Set<string> {
	const paths = new Set<string>();
	const walk = (items: FolderTreeNode[]): void => {
		for (const node of items) {
			paths.add(node.path);
			walk(node.children);
		}
	};
	walk(nodes);
	return paths;
}

export function missingExcludeFolders(selected: string[], existing: Set<string>): string[] {
	return selected.filter((path) => !existing.has(path));
}

function folderChildren(folder: TFolder): TFolder[] {
	return folder.children
		.filter((child): child is TFolder => child instanceof TFolder)
		.sort((left, right) => left.name.localeCompare(right.name));
}
