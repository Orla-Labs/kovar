import { describe, expect, it, vi } from "vitest";
import { AssertionDetector } from "../../../src/recorder/assertion-detector.js";
import type { AssertionSuggestion, RecordedRequest } from "../../../src/recorder/types.js";

function makeRequest(overrides: Partial<RecordedRequest> = {}): RecordedRequest {
	return {
		timestamp: Date.now(),
		method: "GET",
		url: "https://api.example.com/api/users",
		resourceType: "fetch",
		requestHeaders: {},
		requestPostData: null,
		responseStatus: 200,
		responseHeaders: {},
		responseBody: null,
		duration: 100,
		...overrides,
	};
}

describe("AssertionDetector", () => {
	it("getSuggestions returns empty array initially", () => {
		const detector = new AssertionDetector();
		expect(detector.getSuggestions()).toEqual([]);
	});

	it("getAcceptedCount returns 0 initially", () => {
		const detector = new AssertionDetector();
		expect(detector.getAcceptedCount()).toBe(0);
	});

	it("getAcceptedAssertions returns empty array initially", () => {
		const detector = new AssertionDetector();
		expect(detector.getAcceptedAssertions()).toEqual([]);
	});

	describe("suggestFromNetwork", () => {
		it("creates suggestion for API calls with /api/ path", () => {
			const detector = new AssertionDetector();
			detector.suggestFromNetwork(
				makeRequest({ method: "POST", url: "https://example.com/api/login", responseStatus: 200 }),
			);
			const suggestions = detector.getSuggestions();
			expect(suggestions).toHaveLength(1);
			expect(suggestions[0]?.type).toBe("api_status");
			expect(suggestions[0]?.description).toContain("POST");
			expect(suggestions[0]?.description).toContain("200");
		});

		it("creates suggestion for /graphql endpoints", () => {
			const detector = new AssertionDetector();
			detector.suggestFromNetwork(
				makeRequest({ url: "https://example.com/graphql", method: "POST", responseStatus: 200 }),
			);
			expect(detector.getSuggestions()).toHaveLength(1);
		});

		it("ignores non-fetch/xhr resource types", () => {
			const detector = new AssertionDetector();
			detector.suggestFromNetwork(makeRequest({ resourceType: "document" }));
			expect(detector.getSuggestions()).toHaveLength(0);
		});

		it("ignores non-API URLs", () => {
			const detector = new AssertionDetector();
			detector.suggestFromNetwork(makeRequest({ url: "https://example.com/page" }));
			expect(detector.getSuggestions()).toHaveLength(0);
		});

		it("truncates long paths", () => {
			const detector = new AssertionDetector();
			const longPath = `/api/${"a".repeat(100)}`;
			detector.suggestFromNetwork(
				makeRequest({ url: `https://example.com${longPath}`, responseStatus: 201 }),
			);
			const desc = detector.getSuggestions()[0]?.description ?? "";
			expect(desc).toContain("...");
			expect(desc).toContain("201");
		});

		it("includes afterActionIndex from current count", () => {
			const detector = new AssertionDetector();
			detector.setActionCount(5);
			detector.suggestFromNetwork(makeRequest());
			expect(detector.getSuggestions()[0]?.afterActionIndex).toBe(5);
		});
	});

	describe("setOnSuggestion callback", () => {
		it("fires callback when network suggestion is added", () => {
			const detector = new AssertionDetector();
			const callback = vi.fn();
			detector.setOnSuggestion(callback);
			detector.suggestFromNetwork(makeRequest());
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith(expect.objectContaining({ type: "api_status" }));
		});
	});

	describe("setActionCount", () => {
		it("updates the action count used for new suggestions", () => {
			const detector = new AssertionDetector();
			detector.setActionCount(0);
			detector.suggestFromNetwork(makeRequest());
			expect(detector.getSuggestions()[0]?.afterActionIndex).toBe(0);

			detector.setActionCount(10);
			detector.suggestFromNetwork(
				makeRequest({ url: "https://example.com/api/other", method: "PUT" }),
			);
			expect(detector.getSuggestions()[1]?.afterActionIndex).toBe(10);
		});
	});

	describe("playwrightCode format", () => {
		it("includes method, path, and status in comment", () => {
			const detector = new AssertionDetector();
			detector.suggestFromNetwork(
				makeRequest({
					method: "DELETE",
					url: "https://example.com/api/items/1",
					responseStatus: 204,
				}),
			);
			const code = detector.getSuggestions()[0]?.playwrightCode ?? "";
			expect(code).toContain("DELETE");
			expect(code).toContain("/api/items/1");
			expect(code).toContain("204");
		});
	});
});
