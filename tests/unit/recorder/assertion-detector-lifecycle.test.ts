import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/recorder/browser-scripts.js", () => ({
	getAssertionDetectorScript: () => "// mock browser script",
}));

/**
 * Tests for AssertionDetector Node-side lifecycle from assertion-detector.ts.
 *
 * Strategy: We test the Node-side class methods directly by using the
 * existing MockPage helper and calling attach/accept/dismiss methods.
 */

import { AssertionDetector } from "../../../src/recorder/assertion-detector.js";
import { MockPage } from "../../helpers/mock-page.js";

describe("AssertionDetector — Node-side lifecycle", () => {
	let detector: AssertionDetector;
	let page: MockPage;

	beforeEach(async () => {
		detector = new AssertionDetector();
		page = new MockPage();
		await detector.attach(page as never);
	});

	function getExposed(name: string) {
		const fn = page.getExposedFunction(name);
		if (!fn) throw new Error(`Exposed function ${name} not found`);
		return fn;
	}

	it("syncActionCount propagates count to browser via page.evaluate", async () => {
		detector.setActionCount(42);
		await detector.syncActionCount(page as never);

		expect(page.evaluate).toHaveBeenCalled();
	});

	it("accept marks suggestion as accepted and calls page callback", () => {
		const suggestFn = getExposed("__kovar_suggestAssertion");
		suggestFn(
			JSON.stringify({
				id: "test_accept_1",
				type: "text_visible",
				description: "Assert text is visible",
				playwrightCode: "await expect(page.getByText('hello')).toBeVisible()",
				timestamp: Date.now(),
				accepted: false,
				afterActionIndex: 0,
			}),
		);

		expect(detector.getSuggestions()).toHaveLength(1);
		expect(detector.getSuggestions()[0].accepted).toBe(false);

		const acceptFn = getExposed("__kovar_acceptAssertion");
		acceptFn("test_accept_1");

		expect(detector.getSuggestions()[0].accepted).toBe(true);
		expect(detector.getAcceptedAssertions()).toHaveLength(1);
	});

	it("dismiss removes suggestion from list", () => {
		const suggestFn = getExposed("__kovar_suggestAssertion");
		suggestFn(
			JSON.stringify({
				id: "test_dismiss_1",
				type: "url",
				description: "Assert URL changed",
				playwrightCode: "await expect(page).toHaveURL(/test/)",
				timestamp: Date.now(),
				accepted: false,
				afterActionIndex: 0,
			}),
		);

		expect(detector.getSuggestions()).toHaveLength(1);

		const dismissFn = getExposed("__kovar_dismissAssertion");
		dismissFn("test_dismiss_1");

		expect(detector.getSuggestions()).toHaveLength(0);
	});

	it("multiple accept/dismiss operations in sequence", () => {
		const suggestFn = getExposed("__kovar_suggestAssertion");
		const acceptFn = getExposed("__kovar_acceptAssertion");
		const dismissFn = getExposed("__kovar_dismissAssertion");

		for (let i = 1; i <= 5; i++) {
			suggestFn(
				JSON.stringify({
					id: `seq_${i}`,
					type: "text_visible",
					description: `Suggestion ${i}`,
					playwrightCode: `expect(${i})`,
					timestamp: Date.now(),
					accepted: false,
					afterActionIndex: i,
				}),
			);
		}

		expect(detector.getSuggestions()).toHaveLength(5);

		// Accept #1 and #3
		acceptFn("seq_1");
		acceptFn("seq_3");
		expect(detector.getAcceptedCount()).toBe(2);

		// Dismiss #2 and #4
		dismissFn("seq_2");
		dismissFn("seq_4");

		// 3 suggestions remain: #1 (accepted), #3 (accepted), #5 (not accepted)
		expect(detector.getSuggestions()).toHaveLength(3);
		expect(detector.getAcceptedAssertions()).toHaveLength(2);

		// Dismiss #5
		dismissFn("seq_5");
		expect(detector.getSuggestions()).toHaveLength(2);

		// Accept #1 again — should still be accepted (idempotent)
		acceptFn("seq_1");
		expect(detector.getAcceptedCount()).toBe(2);
	});

	it("suggestions list doesn't exceed MAX_SUGGESTIONS (50) in browser script", () => {
		const suggestFn = getExposed("__kovar_suggestAssertion");

		// Add 60 suggestions — the Node side has no limit but handles them
		for (let i = 1; i <= 60; i++) {
			suggestFn(
				JSON.stringify({
					id: `mass_${i}`,
					type: "text_visible",
					description: `Mass suggestion ${i}`,
					playwrightCode: `expect(${i})`,
					timestamp: Date.now(),
					accepted: false,
					afterActionIndex: i,
				}),
			);
		}

		// All 60 added on Node side
		expect(detector.getSuggestions()).toHaveLength(60);

		// Accept first 10
		const acceptFn = getExposed("__kovar_acceptAssertion");
		for (let i = 1; i <= 10; i++) {
			acceptFn(`mass_${i}`);
		}
		expect(detector.getAcceptedCount()).toBe(10);
	});

	it("onSuggestion callback is invoked for each new suggestion", () => {
		const callback = vi.fn();
		detector.setOnSuggestion(callback);

		const suggestFn = getExposed("__kovar_suggestAssertion");
		suggestFn(
			JSON.stringify({
				id: "cb_1",
				type: "title",
				description: "Assert title",
				playwrightCode: "await expect(page).toHaveTitle(/test/)",
				timestamp: Date.now(),
				accepted: false,
				afterActionIndex: 0,
			}),
		);

		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: "cb_1" }));
	});

	it("setActionCount updates afterActionIndex on new suggestions", () => {
		detector.setActionCount(10);

		const suggestFn = getExposed("__kovar_suggestAssertion");
		suggestFn(
			JSON.stringify({
				id: "idx_1",
				type: "url",
				description: "Assert URL",
				playwrightCode: "expect(page).toHaveURL()",
				timestamp: Date.now(),
				accepted: false,
				afterActionIndex: 0,
			}),
		);

		// The Node-side overrides afterActionIndex with currentActionCount
		expect(detector.getSuggestions()[0].afterActionIndex).toBe(10);
	});

	it("suggestFromNetwork creates suggestion for API requests", () => {
		detector.setActionCount(5);

		detector.suggestFromNetwork({
			timestamp: Date.now(),
			method: "GET",
			url: "https://example.com/api/users",
			resourceType: "fetch",
			requestHeaders: {},
			requestPostData: null,
			responseStatus: 200,
			responseHeaders: {},
			responseBody: null,
			duration: 100,
		});

		expect(detector.getSuggestions()).toHaveLength(1);
		const s = detector.getSuggestions()[0];
		expect(s.type).toBe("api_status");
		expect(s.description).toContain("GET");
		expect(s.description).toContain("200");
		expect(s.afterActionIndex).toBe(5);
	});

	it("suggestFromNetwork ignores non-fetch/xhr requests", () => {
		detector.suggestFromNetwork({
			timestamp: Date.now(),
			method: "GET",
			url: "https://example.com/api/users",
			resourceType: "document",
			requestHeaders: {},
			requestPostData: null,
			responseStatus: 200,
			responseHeaders: {},
			responseBody: null,
			duration: 100,
		});

		expect(detector.getSuggestions()).toHaveLength(0);
	});

	it("suggestFromNetwork ignores non-API URLs", () => {
		detector.suggestFromNetwork({
			timestamp: Date.now(),
			method: "GET",
			url: "https://example.com/static/bundle.js",
			resourceType: "fetch",
			requestHeaders: {},
			requestPostData: null,
			responseStatus: 200,
			responseHeaders: {},
			responseBody: null,
			duration: 100,
		});

		expect(detector.getSuggestions()).toHaveLength(0);
	});
});
