import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import type { LLMProvider } from "./types.js";

export type { LLMProvider, LLMResponse, PromptPayload } from "./types.js";
export { LLMRequestError } from "./retry.js";

function warnIfInvalidKeyFormat(key: string, provider: "anthropic" | "openai"): void {
	if (provider === "anthropic") {
		if (!key.startsWith("sk-ant-") || key.length <= 20) {
			console.warn(
				"[kovar] API key format may be invalid. Check your ANTHROPIC_API_KEY / OPENAI_API_KEY.",
			);
		}
	} else {
		if (!key.startsWith("sk-") || key.length <= 20) {
			console.warn(
				"[kovar] API key format may be invalid. Check your ANTHROPIC_API_KEY / OPENAI_API_KEY.",
			);
		}
	}
}

export function createLLMProvider(provider?: string, model?: string): LLMProvider {
	const anthropicKey = process.env.ANTHROPIC_API_KEY;
	const openaiKey = process.env.OPENAI_API_KEY;

	if (provider === "anthropic" || (!provider && anthropicKey)) {
		if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
		warnIfInvalidKeyFormat(anthropicKey, "anthropic");
		return new AnthropicProvider(anthropicKey, model);
	}

	if (provider === "openai" || (!provider && openaiKey)) {
		if (!openaiKey) throw new Error("OPENAI_API_KEY environment variable is required");
		warnIfInvalidKeyFormat(openaiKey, "openai");
		return new OpenAIProvider(openaiKey, model);
	}

	throw new Error(
		"No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.",
	);
}
