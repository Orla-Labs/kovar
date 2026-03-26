import { LLMRequestError, fetchWithRetry } from "./retry.js";
import type { LLMProvider, LLMResponse, PromptPayload } from "./types.js";

const API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";

function sanitizeErrorDetail(msg: string): string {
	return msg.replace(/\b(sk-|pk-|key-|Bearer\s+)[a-zA-Z0-9_-]{10,}\b/g, "[REDACTED]");
}

export class OpenAIProvider implements LLMProvider {
	name = "openai";

	constructor(
		private apiKey: string,
		private model = DEFAULT_MODEL,
	) {}

	async generate(payload: PromptPayload): Promise<LLMResponse> {
		const response = await fetchWithRetry(
			API_URL,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					max_tokens: payload.maxTokens,
					messages: [
						{ role: "system", content: payload.systemPrompt },
						{ role: "user", content: payload.userPrompt },
					],
				}),
			},
			"OpenAI",
		);

		if (!response.ok) {
			const body = await response.text();
			let errorType = `HTTP ${response.status}`;
			try {
				const parsed = JSON.parse(body) as { error?: { type?: string; message?: string } };
				if (parsed.error?.type) errorType = sanitizeErrorDetail(parsed.error.type);
				if (parsed.error?.message) errorType += `: ${sanitizeErrorDetail(parsed.error.message)}`;
			} catch {
				// Non-JSON error body — use status only to avoid leaking request content
			}
			throw new LLMRequestError(
				`OpenAI API error (${response.status}): ${errorType}`,
				1,
				response.status,
			);
		}

		const data = (await response.json()) as {
			choices: { message: { content: string } }[];
			usage: { total_tokens: number };
		};

		if (!Array.isArray(data.choices) || data.choices.length === 0 || !data.choices[0]?.message) {
			throw new Error("OpenAI API returned invalid response: missing choices or message");
		}

		return {
			testCode: data.choices[0].message.content ?? "",
			testName: "",
			tokensUsed: data.usage.total_tokens,
		};
	}
}
