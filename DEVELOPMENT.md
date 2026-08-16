# Development

Build and release notes for Vault Assistant. The plugin id is `vault-assistant`; the plugin folder name must match.

Requires Node.js 18+.

## Install from source

Obsidian ignores or removes empty plugin folders. The folder must already contain `manifest.json`. Do not create it from Obsidian’s file explorer.

**Recommended:** symlink this repo:

```bash
ln -s /absolute/path/to/this-repo \
  "/path/to/YourVault/.obsidian/plugins/vault-assistant"
```

Quit Obsidian first if a leftover empty folder keeps vanishing. Then:

```bash
cd /absolute/path/to/this-repo
npm install
npm run dev
```

In Obsidian: **Settings → Community plugins** → enable **Vault Assistant**. Reload once if it does not appear.

**Alternative:** copy the whole project (not an empty folder) into `.obsidian/plugins/vault-assistant/`.

If the vault is in iCloud, copy or symlink with `manifest.json` already in place.

## Scripts

```bash
npm run dev    # watch build to main.js
npm run build  # typecheck and production bundle
npm run lint   # ESLint, including eslint-plugin-obsidianmd
```

Source lives in `src/`. `src/main.ts` only handles plugin lifecycle. TypeScript is bundled with esbuild.

## Release

Release artifacts: `main.js`, `manifest.json`, and `styles.css`. Do not commit `main.js`, `data.json`, or `search-index.json`.

1. Set `version` in `manifest.json` (SemVer `x.y.z`) and the matching `minAppVersion`.
2. Run `npm version patch` (or minor/major) so `package.json`, `manifest.json`, and `versions.json` stay in sync.
3. Create a GitHub release whose tag equals the version (no `v` prefix).
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.

The community directory uses `manifest.json` on the default branch and downloads those assets from the GitHub release whose tag matches `version`. The plugin `id` must stay unique and must not contain `obsidian`.
