import type { LLMProvider, LLMResponse, PromptPayload } from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export class AnthropicProvider implements LLMProvider {
	name = "anthropic";

	constructor(
		private apiKey: string,
		private model = DEFAULT_MODEL,
	) {}

	async generate(payload: PromptPayload): Promise<LLMResponse> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 60000);
		try {
			const response = await fetch(API_URL, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": API_VERSION,
				},
				body: JSON.stringify({
					model: this.model,
					max_tokens: payload.maxTokens,
					system: payload.systemPrompt,
					messages: [{ role: "user", content: payload.userPrompt }],
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const body = await response.text();
				let errorType = `HTTP ${response.status}`;
				try {
					const parsed = JSON.parse(body) as { error?: { type?: string; message?: string } };
					if (parsed.error?.type) errorType = parsed.error.type;
					if (parsed.error?.message) errorType += `: ${parsed.error.message}`;
				} catch {
					// Non-JSON error body — use status only to avoid leaking request content
				}
				throw new Error(`Anthropic API error (${response.status}): ${errorType}`);
			}

			const data = (await response.json()) as {
				content: { type: string; text: string }[];
				usage: { input_tokens: number; output_tokens: number };
			};

			if (!Array.isArray(data.content) || data.content.length === 0) {
				throw new Error("Anthropic API returned invalid response: missing content array");
			}

			const text = data.content.find((c) => c.type === "text")?.text ?? "";

			return {
				testCode: text,
				testName: "",
				tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
			};
		} finally {
			clearTimeout(timeout);
		}
	}
}
