# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/bigpaulie/obsidian-assistant/compare/1.1.0...HEAD
[1.1.0]: https://github.com/bigpaulie/obsidian-assistant/compare/1.0.2...1.1.0
[1.0.2]: https://github.com/bigpaulie/obsidian-assistant/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/bigpaulie/obsidian-assistant/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/bigpaulie/obsidian-assistant/releases/tag/1.0.0
