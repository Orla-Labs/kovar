import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import type { LLMProvider } from "./types.js";

export type { LLMProvider, LLMResponse, PromptPayload } from "./types.js";
export { LLMRequestError } from "./retry.js";

export function createLLMProvider(provider?: string, model?: string): LLMProvider {
	const anthropicKey = process.env.ANTHROPIC_API_KEY;
	const openaiKey = process.env.OPENAI_API_KEY;

	if (provider === "anthropic" || (!provider && anthropicKey)) {
		if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY environment variable is required");
		return new AnthropicProvider(anthropicKey, model);
	}

	if (provider === "openai" || (!provider && openaiKey)) {
		if (!openaiKey) throw new Error("OPENAI_API_KEY environment variable is required");
		return new OpenAIProvider(openaiKey, model);
	}

	throw new Error(
		"No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.",
	);
}
