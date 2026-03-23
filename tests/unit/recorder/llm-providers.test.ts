import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for LLM provider error handling (Anthropic + OpenAI).
 *
 * Strategy: Mock global `fetch` to return configurable responses.
 * Use fake timers to avoid real sleep waits in retry logic.
 * The fetchWithRetry function uses setTimeout for both the abort
 * controller timeout and sleep between retries.
 */

import { AnthropicProvider } from "../../../src/recorder/llm/anthropic.js";
import { OpenAIProvider } from "../../../src/recorder/llm/openai.js";
import { LLMRequestError } from "../../../src/recorder/llm/retry.js";

const MOCK_PAYLOAD = {
	systemPrompt: "You are a test generator.",
	userPrompt: "Generate a test.",
	maxTokens: 1024,
};

function makeMockResponse(
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): Response {
	const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "Error",
		headers: new Headers(headers),
		text: async () => bodyStr,
		json: async () => (typeof body === "string" ? JSON.parse(body) : body),
		clone: () => makeMockResponse(status, body, headers),
		body: null,
		bodyUsed: false,
		type: "basic" as ResponseType,
		url: "",
		redirected: false,
		arrayBuffer: async () => new ArrayBuffer(0),
		blob: async () => new Blob(),
		formData: async () => new FormData(),
	} as Response;
}

/**
 * Helper that runs a provider.generate() call while advancing fake timers
 * so that retry sleeps and abort timeouts don't block.
 */
async function runWithTimerAdvancement<T>(fn: () => Promise<T>): Promise<T> {
	const promise = fn();

	// Repeatedly advance timers to resolve retry sleeps and abort timeouts
	// We use a microtask-based approach to interleave timer advancement
	// with promise resolution.
	let resolved = false;
	let result: T;
	let error: unknown;

	promise
		.then((r) => {
			resolved = true;
			result = r;
		})
		.catch((e) => {
			resolved = true;
			error = e;
		});

	// Advance in chunks until the promise resolves
	for (let i = 0; i < 100 && !resolved; i++) {
		await vi.advanceTimersByTimeAsync(2000);
	}

	if (!resolved) {
		throw new Error("Promise did not resolve after timer advancement");
	}
	if (error) throw error;
	return result!;
}

describe("AnthropicProvider — error handling", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("fetch", vi.fn());
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("handles non-JSON error body gracefully", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);
		// 400 is not a transient code, so no retries
		mockFetch.mockResolvedValue(makeMockResponse(400, "Bad Request — plain text"));

		const provider = new AnthropicProvider("test-key");

		await expect(runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD))).rejects.toThrow(
			LLMRequestError,
		);
	});

	it("handles missing content array in response", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);
		mockFetch.mockResolvedValue(
			makeMockResponse(200, {
				content: [],
				usage: { input_tokens: 10, output_tokens: 5 },
			}),
		);

		const provider = new AnthropicProvider("test-key");

		await expect(runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD))).rejects.toThrow(
			/missing content array/,
		);
	});

	it("handles abort timeout (AbortSignal)", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);
		const abortError = new DOMException("The operation was aborted", "AbortError");
		mockFetch.mockRejectedValue(abortError);

		const provider = new AnthropicProvider("test-key");

		// AbortError is not transient, so it throws directly without retries
		await expect(runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD))).rejects.toThrow();
	});

	it("handles network errors (fetch throws)", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);
		const networkError = new Error("fetch failed");
		(networkError as Error & { cause?: { code: string } }).cause = { code: "ECONNRESET" };
		mockFetch.mockRejectedValue(networkError);

		const provider = new AnthropicProvider("test-key");

		// Network error with ECONNRESET is transient — retried then fails
		await expect(runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD))).rejects.toThrow(
			LLMRequestError,
		);
	});

	it("retries on transient errors (429, 503)", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);

		// First call: 429, second call: 503, third call: 200 success
		mockFetch
			.mockResolvedValueOnce(
				makeMockResponse(429, { error: { type: "rate_limit", message: "Too many requests" } }),
			)
			.mockResolvedValueOnce(
				makeMockResponse(503, { error: { type: "overloaded", message: "Server busy" } }),
			)
			.mockResolvedValueOnce(
				makeMockResponse(200, {
					content: [{ type: "text", text: "generated test code" }],
					usage: { input_tokens: 100, output_tokens: 50 },
				}),
			);

		const provider = new AnthropicProvider("test-key");
		const result = await runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD));

		expect(result.testCode).toBe("generated test code");
		expect(result.tokensUsed).toBe(150);
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it("includes attempt count in final error message after exhausting retries", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);

		// All calls return 429 — exhaust all retries
		mockFetch.mockResolvedValue(
			makeMockResponse(429, { error: { type: "rate_limit", message: "Too many" } }),
		);

		const provider = new AnthropicProvider("test-key");

		try {
			await runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD));
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(LLMRequestError);
			const llmErr = err as LLMRequestError;
			expect(llmErr.message).toContain("429");
			expect(llmErr.attempts).toBeGreaterThanOrEqual(1);
		}
	});
});

describe("OpenAIProvider — error handling", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("fetch", vi.fn());
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("handles missing choices array in response", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);
		mockFetch.mockResolvedValue(
			makeMockResponse(200, {
				choices: [],
				usage: { total_tokens: 10 },
			}),
		);

		const provider = new OpenAIProvider("test-key");

		await expect(runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD))).rejects.toThrow(
			/missing choices or message/,
		);
	});

	it("handles non-JSON error body gracefully", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);
		// 400 is non-transient
		mockFetch.mockResolvedValue(makeMockResponse(400, "Bad Request"));

		const provider = new OpenAIProvider("test-key");

		await expect(runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD))).rejects.toThrow(
			LLMRequestError,
		);
	});

	it("handles abort timeout (AbortSignal)", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);
		const abortError = new DOMException("Aborted", "AbortError");
		mockFetch.mockRejectedValue(abortError);

		const provider = new OpenAIProvider("test-key");

		await expect(runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD))).rejects.toThrow();
	});

	it("handles network errors (fetch throws)", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);
		const networkError = new Error("Network failure");
		(networkError as Error & { cause?: { code: string } }).cause = { code: "ETIMEDOUT" };
		mockFetch.mockRejectedValue(networkError);

		const provider = new OpenAIProvider("test-key");

		await expect(runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD))).rejects.toThrow(
			LLMRequestError,
		);
	});

	it("retries on transient errors (429, 503)", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);

		mockFetch
			.mockResolvedValueOnce(
				makeMockResponse(503, { error: { type: "server_error", message: "Service unavailable" } }),
			)
			.mockResolvedValueOnce(
				makeMockResponse(200, {
					choices: [{ message: { content: "test code from openai" } }],
					usage: { total_tokens: 75 },
				}),
			);

		const provider = new OpenAIProvider("test-key");
		const result = await runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD));

		expect(result.testCode).toBe("test code from openai");
		expect(result.tokensUsed).toBe(75);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it("includes attempt count in final error message after exhausting retries", async () => {
		const mockFetch = vi.mocked(globalThis.fetch);

		mockFetch.mockResolvedValue(
			makeMockResponse(503, { error: { type: "server_error", message: "Overloaded" } }),
		);

		const provider = new OpenAIProvider("test-key");

		try {
			await runWithTimerAdvancement(() => provider.generate(MOCK_PAYLOAD));
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(LLMRequestError);
			const llmErr = err as LLMRequestError;
			expect(llmErr.message).toContain("503");
			expect(llmErr.attempts).toBeGreaterThanOrEqual(1);
		}
	});
});
