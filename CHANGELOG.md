# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.1] - 2026-08-22

### Fixed

- Plugin TypeScript project stays `src/` only (tests remain at repo-root `tests/`), so the community review typecheck is not poisoned by the Vitest `obsidian` stub.
- `esbuild` is pinned inside Vite 8’s optional peer range so the community scanner’s `npm ci --ignore-scripts` (npm 10) can install `obsidian` types instead of reporting every API as `error`.
- `npm run lint` fails on ESLint warnings, and the release workflow runs lint before publishing.

## [1.4.0] - 2026-08-22

### Added

- Thinking model replies show a collapsed Thinking section (OpenAI reasoning summaries, Chat Completions reasoning fields, and `<think>` tags).
- Optional model and token counts under assistant replies (on by default).

## [1.3.3] - 2026-08-21

### Fixed

- Plugin TypeScript project is `src/` only again, so the community review typecheck is not poisoned by the Vitest `obsidian` runtime stub.

## [1.3.2] - 2026-08-21

### Added

- Unit tests (Vitest) for path sanitizing, RAG chunking, LLM routing/parsing, tool proposals, and the mobile keyboard inset, run in CI.

## [1.3.1] - 2026-08-20

### Fixed

- Mobile composer sits on the software keyboard again, without the stacked inset gap from earlier fixes.

## [1.3.0] - 2026-08-19

### Added

- OpenAI gpt-5.4+ models (including gpt-5.6-sol) call function tools through `/v1/responses`. Tools are defined once and converted per API; OpenRouter and Ollama keep Chat Completions tools.

### Fixed

- Debug mode saves when toggled and shows a Debug card in chat. Console lines still need DevTools log level Verbose.

## [1.2.0] - 2026-08-19

### Added

- Debug mode setting that shows request detail in chat and the developer console (no API keys or note contents).

## [1.1.3] - 2026-08-17

### Fixed

- Mobile composer sits on the keyboard instead of leaving a gap from stacked keyboard insets.
- Chat errors use the same visible status card as “Thinking…”, with provider text and a **Copy details** button (no API keys).
- OpenAI gpt-5, o-series, and gpt-4.1+ models send `max_completion_tokens` and omit unsupported `temperature`.

## [1.1.2] - 2026-08-16

### Fixed

- Mobile composer follows Obsidian’s `--keyboard-height` (and visualViewport when it changes) by padding the chat leaf, so the field stays above the iOS keyboard.

## [1.1.1] - 2026-08-16

### Fixed

- Mobile chat composer stays above the software keyboard, with **Done** or a tap on the transcript to hide it.

## [1.1.0] - 2026-08-16

### Changed

- Mobile chat pane has more padding, 44px tap targets, a shorter composer, and tighter markdown inside bubbles.

## [1.0.2] - 2026-08-16

### Added

- GitHub Actions release workflow that builds `main.js` and publishes signed artifact attestations for `main.js`, `manifest.json`, and `styles.css`.

### Changed

- Privacy notes now state that local search lists markdown note paths, and that network calls go only to the chosen provider.

## [1.0.1] - 2026-08-16

### Changed

- Settings now use Obsidian’s declarative settings API (`getSettingDefinitions()`), so they appear in global settings search on Obsidian 1.13.0 or later.
- Minimum Obsidian version is now 1.13.0.

## [1.0.0] - 2026-08-16

### Added

- Sidebar chat with markdown replies and `[[wikilinks]]`.
- OpenAI, OpenRouter, and Ollama (localhost or custom URL) providers.
- Local note search (no cloud indexing, no embeddings).
- Pin notes with **Add note**, **Add open note**, or `[[wikilinks]]` on desktop.
- Propose new or updated notes in chat; nothing is written until you apply it.

[unreleased]: https://github.com/bigpaulie/obsidian-assistant/compare/1.4.1...HEAD
[1.4.1]: https://github.com/bigpaulie/obsidian-assistant/compare/1.4.0...1.4.1
[1.4.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.3.3...1.4.0
[1.3.3]: https://github.com/bigpaulie/obsidian-assistant/compare/1.3.2...1.3.3
[1.3.2]: https://github.com/bigpaulie/obsidian-assistant/compare/1.3.1...1.3.2
[1.3.1]: https://github.com/bigpaulie/obsidian-assistant/compare/1.3.0...1.3.1
[1.3.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.1.3...1.2.0
[1.1.3]: https://github.com/bigpaulie/obsidian-assistant/compare/1.1.2...1.1.3
[1.1.2]: https://github.com/bigpaulie/obsidian-assistant/compare/1.1.1...1.1.2
[1.1.1]: https://github.com/bigpaulie/obsidian-assistant/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.0.2...1.1.0
[1.0.2]: https://github.com/bigpaulie/obsidian-assistant/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/bigpaulie/obsidian-assistant/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/bigpaulie/obsidian-assistant/releases/tag/1.0.0
