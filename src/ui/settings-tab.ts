import { App, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import { DEFAULT_MODELS, DEFAULT_OLLAMA_URL } from '../constants';
import { LlmClient } from '../llm/client';
import { isLocalhostUrl, normalizeServerUrl } from '../llm/providers';
import type VaultAssistantPlugin from '../main';
import { PROVIDER_LABELS, type ProviderId, type VaultAssistantSettings } from '../settings';

type SettingsKey = keyof VaultAssistantSettings;
type ApiKeyField = 'openaiApiKey' | 'openrouterApiKey' | 'ollamaApiKey';

export class VaultAssistantSettingTab extends PluginSettingTab {
	private detectedModels: string[] = [];

	constructor(
		app: App,
		private readonly plugin: VaultAssistantPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
		const settings = this.plugin.settings;

		return [
			{
				name: 'Provider',
				desc: 'OpenAI-compatible endpoint used for chat.',
				render: (setting) => {
					setting.addDropdown((dropdown) => {
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
							this.update();
						});
					});
				},
			},
			{
				name: 'API key',
				desc: 'OpenAI API key.',
				visible: () => this.plugin.settings.provider === 'openai',
				render: (setting) => this.renderApiKey(setting, 'openaiApiKey'),
			},
			{
				name: 'API key',
				desc: 'OpenRouter API key.',
				visible: () => this.plugin.settings.provider === 'openrouter',
				render: (setting) => this.renderApiKey(setting, 'openrouterApiKey'),
			},
			{
				name: 'Ollama URL',
				desc: 'Leave empty for the local default, or enter a custom host.',
				visible: () => this.plugin.settings.provider === 'ollama',
				control: {
					type: 'text',
					key: 'ollamaUrl',
					placeholder: DEFAULT_OLLAMA_URL,
				},
			},
			{
				name: 'API key (optional)',
				desc: 'Only needed if your Ollama-compatible server requires a bearer token.',
				visible: () => this.isRemoteOllama(),
				render: (setting) => this.renderApiKey(setting, 'ollamaApiKey'),
			},
			{
				name: 'Model',
				desc: 'Name of the chat model on your provider.',
				render: (setting) => {
					if (this.detectedModels.length > 0) {
						setting.addDropdown((dropdown) => {
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
					setting.addText((text) => {
						text.setPlaceholder(DEFAULT_MODELS[settings.provider]);
						text.setValue(settings.model);
						text.onChange(async (value) => {
							settings.model = value.trim();
							await this.plugin.saveSettings();
						});
					});
					setting.addButton((button) => {
						button.setButtonText('Detect models');
						button.onClick(() => void this.detectModels());
					});
				},
			},
			{
				name: 'Test connection',
				desc: 'Calls the provider /models endpoint.',
				render: (setting) => {
					setting.addButton((button) => {
						button.setButtonText('Test');
						button.onClick(() => void this.testConnection());
					});
				},
			},
			{
				type: 'group',
				heading: 'Chat',
				cls: 'vault-assistant-settings-group',
				items: [
					{
						name: 'Temperature',
						desc: 'Lower values are more deterministic. Higher values are more varied.',
						control: {
							type: 'slider',
							key: 'temperature',
							min: 0,
							max: 1,
							step: 0.1,
						},
					},
					{
						name: 'Max tokens',
						desc: 'Upper bound for the model reply.',
						control: {
							type: 'number',
							key: 'maxTokens',
							min: 1,
							placeholder: '2048',
						},
					},
					{
						name: 'Extra system prompt',
						desc: 'Optional instructions appended to the built-in assistant prompt.',
						control: {
							type: 'textarea',
							key: 'systemPrompt',
							placeholder: 'You prefer short answers…',
							rows: 4,
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Retrieval',
				cls: 'vault-assistant-settings-group',
				items: [
					{
						name: 'Use local note search',
						desc: 'Search your notes locally and send matching chunks with the chat request.',
						control: {
							type: 'toggle',
							key: 'ragEnabled',
						},
					},
					{
						name: 'Max chunks',
						desc: 'How many note chunks to retrieve per question.',
						control: {
							type: 'slider',
							key: 'maxChunks',
							min: 1,
							max: 20,
							step: 1,
						},
					},
					{
						name: 'Exclude folders',
						desc: 'One vault folder path per line. The config folder is always excluded.',
						control: {
							type: 'textarea',
							key: 'excludeFolders',
							placeholder: 'Path/to/folder',
							rows: 4,
						},
					},
					{
						name: 'Search index',
						desc: `Indexed chunks: ${this.plugin.indexer.chunkCount}. Stored in the plugin folder, not as a note.`,
						render: (setting) => {
							setting.addButton((button) => {
								button.setButtonText('Rebuild index');
								button.onClick(() => void this.rebuildIndex(button.buttonEl));
							});
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Privacy',
				items: [
					{
						name: 'I understand what is sent to the provider',
						desc: 'Indexing stays on this device. Chat sends your prompt, retrieved chunks, and any notes the agent reads to the selected provider. Nothing is written to your vault until you confirm in chat.',
						control: {
							type: 'toggle',
							key: 'privacyAcknowledged',
						},
					},
				],
			},
		];
	}

	private renderApiKey(setting: Setting, key: ApiKeyField): void {
		setting.addText((text) => {
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

	private isRemoteOllama(): boolean {
		if (this.plugin.settings.provider !== 'ollama') {
			return false;
		}
		const parsed = normalizeServerUrl(this.plugin.settings.ollamaUrl || DEFAULT_OLLAMA_URL);
		return parsed !== null && !isLocalhostUrl(parsed);
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
			this.update();
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
			this.update();
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
