# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.10.1] - 2026-08-31

### Fixed

- Mobile `@` saved-prompt shorthand: Space and Enter triggers work on soft keyboards; `@` + Space opens the fuzzy picker and `@name` expands by name.
- Mobile composer: text no longer clips against the field border after inserting a saved prompt.
- Mobile keyboard inset: composer stays above the software keyboard without flickering or a large gap when the composer grows.

## [1.10.0] - 2026-08-31

### Added

- Saved prompts: create, edit, and delete reusable chat prompts in **Settings → Saved prompts**, stored in `saved-prompts.json` in the plugin folder.
- **Insert saved prompt** command, or type `@` then Space for a fuzzy picker (or pause 1.5s after `@`); type `@name` then Space or Enter to expand by name. Selected text is inserted into the composer for editing before send.

## [1.9.0] - 2026-08-31

### Added

- `get_current_datetime` tool so the assistant can look up the user's local date and time.

## [1.8.0] - 2026-08-30

### Added

- Nearest `system.md` (walk up from the active note’s folder) overrides the Settings extra system prompt; chat shows which system note is active.
- Composer **+** menu: add note, add open note, and attach photos (vision-capable models). Notes and photos appear as compact uniform tiles above the input. Photos are sent with the message but are not saved in chat history.

### Fixed

- System note instructions are appended last with explicit priority so language/style rules are not drowned by retrieved vault context.

## [1.7.0] - 2026-08-25

### Added

- Optional chat history (off by default): save conversations in the plugin folder, resume from History, and generate titles with the model.

### Fixed

- Exclude folders tree keeps folder names beside checkboxes on desktop and mobile.

## [1.6.0] - 2026-08-25

### Changed

- Exclude folders is a vault folder tree: checking a folder skips it and every subfolder.

## [1.5.2] - 2026-08-24

### Changed

- In-flight chat status shows a muted spinner beside “Thinking…”, so the wait state is visibly active.

## [1.5.1] - 2026-08-22

### Changed

- Settings: Provider group; labels above text, dropdown, and slider fields (toggles stay on the native row); dropdowns match text fields; after detect, the model list replaces the text field with Detect on the right; Test and Rebuild sit on the native action row.
- Chat Send sits inside a self-expanding composer field. The mobile **Done** button is removed; tap the transcript to hide the keyboard.

## [1.5.0] - 2026-08-22

### Added

- Propose moving a note to another folder in chat; nothing is written until you apply it.

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

[unreleased]: https://github.com/bigpaulie/obsidian-assistant/compare/1.10.1...HEAD
[1.10.1]: https://github.com/bigpaulie/obsidian-assistant/compare/1.10.0...1.10.1
[1.10.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.9.0...1.10.0
[1.9.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.8.0...1.9.0
[1.8.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.7.0...1.8.0
[1.7.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.6.0...1.7.0
[1.6.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.5.2...1.6.0
[1.5.2]: https://github.com/bigpaulie/obsidian-assistant/compare/1.5.1...1.5.2
[1.5.1]: https://github.com/bigpaulie/obsidian-assistant/compare/1.5.0...1.5.1
[1.5.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.4.1...1.5.0
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
