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
npm run build  # typecheck src/ and production bundle
npm test       # typecheck tests, then Vitest
npm run lint   # ESLint, including eslint-plugin-obsidianmd (warnings fail)
```

Source lives in `src/`. `src/main.ts` only handles plugin lifecycle. TypeScript is bundled with esbuild. Tests stay in repo-root `tests/`, not under `src/`.

`tsconfig.json` includes only `src/**/*.ts`. The community plugin review typechecks that project, so tests and Vitest stay out of it. `tsconfig.test.json` extends it and includes only `tests/**/*.ts` (not plugin `src/` as roots). `npm test` runs `tsc` against that file, then Vitest. The Vitest alias `obsidian` → `tests/stubs/obsidian-runtime.ts` is runtime-only and is not a TypeScript `paths` mapping. Do not add a file named `obsidian.ts`, and do not put tests inside `src/`.

The community scanner runs `npm ci --ignore-scripts` on npm 10. Keep `esbuild` inside Vite 8’s optional peer range (`^0.27.0 || ^0.28.0`) so that install succeeds and `obsidian` types resolve. Do not add `.npmrc` `engine-strict`. CI has a Node 20 job that repeats that install and lint.

## Release

Release artifacts: `main.js`, `manifest.json`, and `styles.css`. Do not commit `main.js`, `data.json`, or `search-index.json`. Do not attach locally built assets; GitHub Actions builds and attests them.

1. Update [CHANGELOG.md](./CHANGELOG.md) (Keep a Changelog): move items from Unreleased into a dated version section and refresh the compare links at the bottom.
2. Run `npm version patch` (or minor/major) so `package.json`, `manifest.json`, and `versions.json` stay in sync. That creates a local commit and tag (`x.y.z`, no `v` prefix).
3. Push the commit and tag:
   ```bash
   git push origin main
   git push origin 1.0.2
   ```
4. Wait for the **Release Obsidian plugin** workflow. It builds, signs provenance for the three assets, and opens a **draft** GitHub release.
5. Edit the draft notes if needed, then publish the release.

The community directory uses `manifest.json` on the default branch and downloads those assets from the GitHub release whose tag matches `version`. The plugin `id` must stay unique and must not contain `obsidian`.

First time only: in the GitHub repo, **Settings → Actions → General → Workflow permissions**, enable **Read and write permissions**. The workflow also needs `id-token` and `attestations` (already set in `.github/workflows/release.yml`).
