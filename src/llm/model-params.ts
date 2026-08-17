export interface CompletionSampling {
	temperature?: number;
	max_tokens?: number;
	max_completion_tokens?: number;
}

/** Chat Completions sampling fields that this model family accepts. */
export function completionSampling(
	model: string,
	temperature: number,
	maxTokens: number,
): CompletionSampling {
	const id = canonicalModelId(model);
	if (isLegacyMaxTokensModel(id)) {
		return { temperature, max_tokens: maxTokens };
	}
	if (isGpt41Family(id)) {
		return { temperature, max_completion_tokens: maxTokens };
	}
	return { max_completion_tokens: maxTokens };
}

function canonicalModelId(model: string): string {
	const trimmed = model.trim().toLowerCase();
	const slash = trimmed.lastIndexOf('/');
	if (slash >= 0) {
		return trimmed.slice(slash + 1);
	}
	return trimmed;
}

/** gpt-4o, gpt-4-turbo, gpt-3.5, and dated gpt-4-* ids still use max_tokens. */
function isLegacyMaxTokensModel(id: string): boolean {
	if (id.startsWith('gpt-4o')) {
		return true;
	}
	if (id.startsWith('gpt-3.5')) {
		return true;
	}
	if (id === 'gpt-4' || id.startsWith('gpt-4-')) {
		return true;
	}
	return false;
}

function isGpt41Family(id: string): boolean {
	return /^gpt-4\./.test(id);
}
