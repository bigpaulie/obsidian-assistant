import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_MODELS, DEFAULT_OLLAMA_URL } from '../constants';
import { LlmClient } from '../llm/client';
import { isLocalhostUrl, normalizeServerUrl } from '../llm/providers';
import type VaultAssistantPlugin from '../main';
import { PROVIDER_LABELS, type ProviderId } from '../settings';

/** Settings tab using the classic `display()` API (supported at minAppVersion 1.7.2). */
export class VaultAssistantSettingTab extends PluginSettingTab {
	private detectedModels: string[] = [];

	constructor(
		app: App,
		private readonly plugin: VaultAssistantPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.plugin.settings;

		new Setting(containerEl)
			.setName('Provider')
			.setDesc('OpenAI-compatible endpoint used for chat.')
			.addDropdown((dropdown) => {
				(Object.keys(PROVIDER_LABELS) as ProviderId[]).forEach((id) => {
					dropdown.addOption(id, PROVIDER_LABELS[id]);
				});
				dropdown.setValue(settings.provider);
				dropdown.onChange(async (value) => {
					settings.provider = value as ProviderId;
					if (!settings.model.trim()) {
						settings.model = DEFAULT_MODELS[settings.provider];
					}
					this.detectedModels = [];
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (settings.provider === 'openai') {
			this.addApiKeySetting(containerEl, 'API key', 'OpenAI API key.', 'openaiApiKey');
		} else if (settings.provider === 'openrouter') {
			this.addApiKeySetting(containerEl, 'API key', 'OpenRouter API key.', 'openrouterApiKey');
		} else {
			new Setting(containerEl)
				.setName('Ollama URL')
				.setDesc('Leave empty for the local default, or enter a custom host.')
				.addText((text) => {
					text.setPlaceholder(DEFAULT_OLLAMA_URL);
					text.setValue(settings.ollamaUrl);
					text.onChange(async (value) => {
						settings.ollamaUrl = value.trim() || DEFAULT_OLLAMA_URL;
						await this.plugin.saveSettings();
					});
				});
			const parsed = normalizeServerUrl(settings.ollamaUrl || DEFAULT_OLLAMA_URL);
			if (parsed && !isLocalhostUrl(parsed)) {
				this.addApiKeySetting(
					containerEl,
					'API key (optional)',
					'Only needed if your Ollama-compatible server requires a bearer token.',
					'ollamaApiKey',
				);
			}
		}

		const modelSetting = new Setting(containerEl)
			.setName('Model')
			.setDesc('Name of the chat model on your provider.');
		if (this.detectedModels.length > 0) {
			modelSetting.addDropdown((dropdown) => {
				for (const id of this.detectedModels) {
					dropdown.addOption(id, id);
				}
				if (!this.detectedModels.includes(settings.model)) {
					dropdown.addOption(settings.model, settings.model);
				}
				dropdown.setValue(settings.model);
				dropdown.onChange(async (value) => {
					settings.model = value;
					await this.plugin.saveSettings();
				});
			});
		}
		modelSetting.addText((text) => {
			text.setPlaceholder(DEFAULT_MODELS[settings.provider]);
			text.setValue(settings.model);
			text.onChange(async (value) => {
				settings.model = value.trim();
				await this.plugin.saveSettings();
			});
		});
		modelSetting.addButton((button) => {
			button.setButtonText('Detect models');
			button.onClick(() => void this.detectModels());
		});

		new Setting(containerEl)
			.setName('Test connection')
			.setDesc('Calls the provider /models endpoint.')
			.addButton((button) => {
				button.setButtonText('Test');
				button.onClick(() => void this.testConnection());
			});

		new Setting(containerEl).setName('Chat').setHeading();

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Lower values are more deterministic. Higher values are more varied.')
			.addSlider((slider) => {
				slider.setLimits(0, 1, 0.1);
				slider.setValue(settings.temperature);
				slider.onChange(async (value) => {
					settings.temperature = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Max tokens')
			.setDesc('Upper bound for the model reply.')
			.addText((text) => {
				text.setPlaceholder('2048');
				text.setValue(String(settings.maxTokens));
				text.onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed) && parsed > 0) {
						settings.maxTokens = parsed;
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName('Extra system prompt')
			.setDesc('Optional instructions appended to the built-in assistant prompt.')
			.addTextArea((area) => {
				area.setPlaceholder('You prefer short answers…');
				area.setValue(settings.systemPrompt);
				area.inputEl.rows = 4;
				area.inputEl.addClass('vault-assistant-setting-wide');
				area.onChange(async (value) => {
					settings.systemPrompt = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName('Retrieval').setHeading();

		new Setting(containerEl)
			.setName('Use local note search')
			.setDesc('Search your notes locally and send matching chunks with the chat request.')
			.addToggle((toggle) => {
				toggle.setValue(settings.ragEnabled);
				toggle.onChange(async (value) => {
					settings.ragEnabled = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Max chunks')
			.setDesc('How many note chunks to retrieve per question.')
			.addSlider((slider) => {
				slider.setLimits(1, 20, 1);
				slider.setValue(settings.maxChunks);
				slider.onChange(async (value) => {
					settings.maxChunks = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Exclude folders')
			.setDesc('One vault folder path per line. The config folder is always excluded.')
			.addTextArea((area) => {
				area.setPlaceholder('Path/to/folder');
				area.setValue(settings.excludeFolders);
				area.inputEl.rows = 4;
				area.inputEl.addClass('vault-assistant-setting-wide');
				area.onChange(async (value) => {
					settings.excludeFolders = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Search index')
			.setDesc(`Indexed chunks: ${this.plugin.indexer.chunkCount}. Stored in the plugin folder, not as a note.`)
			.addButton((button) => {
				button.setButtonText('Rebuild index');
				button.onClick(() => void this.rebuildIndex(button.buttonEl));
			});

		new Setting(containerEl).setName('Privacy').setHeading();

		new Setting(containerEl)
			.setName('I understand what is sent to the provider')
			.setDesc(
				'Indexing stays on this device. Chat sends your prompt, retrieved chunks, and any notes the agent reads to the selected provider. Nothing is written to your vault until you confirm in chat.',
			)
			.addToggle((toggle) => {
				toggle.setValue(settings.privacyAcknowledged);
				toggle.onChange(async (value) => {
					settings.privacyAcknowledged = value;
					await this.plugin.saveSettings();
				});
			});
	}

	private addApiKeySetting(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		key: 'openaiApiKey' | 'openrouterApiKey' | 'ollamaApiKey',
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) => {
				text.setPlaceholder('Paste key');
				text.inputEl.type = 'password';
				text.inputEl.autocomplete = 'off';
				text.setValue(this.plugin.settings[key]);
				text.onChange(async (value) => {
					this.plugin.settings[key] = value.trim();
					await this.plugin.saveSettings();
				});
			});
	}

	private async detectModels(): Promise<void> {
		if (!this.guardPrivacy()) {
			return;
		}
		try {
			const models = await new LlmClient(this.plugin.settings).listModels();
			if (models.length === 0) {
				new Notice('No models returned.');
				return;
			}
			this.detectedModels = models;
			if (!this.plugin.settings.model && models[0]) {
				this.plugin.settings.model = models[0];
				await this.plugin.saveSettings();
			}
			new Notice(`Found ${models.length} models.`);
			this.display();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Unable to list models.');
		}
	}

	private async testConnection(): Promise<void> {
		if (!this.guardPrivacy()) {
			return;
		}
		const result = await new LlmClient(this.plugin.settings).testConnection();
		if (result.ok) {
			new Notice(`Connected. ${result.modelCount} models available.`);
		} else {
			new Notice(result.message);
		}
	}

	private async rebuildIndex(buttonEl: HTMLButtonElement): Promise<void> {
		buttonEl.setAttr('disabled', 'true');
		try {
			await this.plugin.indexer.rebuild();
			new Notice(`Indexed ${this.plugin.indexer.chunkCount} chunks.`);
			this.display();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Unable to rebuild index.');
		} finally {
			buttonEl.removeAttribute('disabled');
		}
	}

	private guardPrivacy(): boolean {
		if (this.plugin.settings.privacyAcknowledged) {
			return true;
		}
		new Notice('Acknowledge the privacy notice before making network requests.');
		return false;
	}
}
