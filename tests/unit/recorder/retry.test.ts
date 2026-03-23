import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLMRequestError, fetchWithRetry } from "../../../src/recorder/llm/retry.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchWithRetry", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("returns the response on a successful first try", async () => {
		const okResponse = { ok: true, status: 200, headers: new Headers() };
		mockFetch.mockResolvedValueOnce(okResponse);

		const result = await fetchWithRetry("https://api.example.com/v1", {}, "TestProvider");

		expect(result).toBe(okResponse);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("retries on transient 429 and succeeds on second attempt", async () => {
		const rateLimitResponse = {
			ok: false,
			status: 429,
			headers: new Headers({ "retry-after": "0" }),
		};
		const okResponse = { ok: true, status: 200, headers: new Headers() };

		mockFetch.mockResolvedValueOnce(rateLimitResponse).mockResolvedValueOnce(okResponse);

		const promise = fetchWithRetry("https://api.example.com/v1", {}, "TestProvider");
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(result).toBe(okResponse);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it("exhausts retries after MAX_RETRIES+1 attempts and returns the last response", async () => {
		const rateLimitResponse = {
			ok: false,
			status: 429,
			headers: new Headers({ "retry-after": "0" }),
		};

		// MAX_RETRIES is 3, so totalAttempts = 4
		// Attempts 1-3 retry (transient + attempt <= MAX_RETRIES), attempt 4 returns the response
		mockFetch.mockResolvedValue(rateLimitResponse);

		const promise = fetchWithRetry("https://api.example.com/v1", {}, "TestProvider");
		await vi.runAllTimersAsync();
		const result = await promise;

		// On the final attempt (4th), the non-ok response is returned (not thrown)
		expect(result.status).toBe(429);
		expect(mockFetch).toHaveBeenCalledTimes(4);
	});

	it("returns immediately on non-transient 400 error without retry", async () => {
		const badRequestResponse = {
			ok: false,
			status: 400,
			headers: new Headers(),
		};

		mockFetch.mockResolvedValueOnce(badRequestResponse);

		const result = await fetchWithRetry("https://api.example.com/v1", {}, "TestProvider");

		expect(result).toBe(badRequestResponse);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});
