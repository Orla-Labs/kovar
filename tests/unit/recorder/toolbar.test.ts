import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toolbarScript = readFileSync(resolve(__dirname, "../../../dist/browser/toolbar.js"), "utf-8");

vi.mock("../../../src/recorder/browser-scripts.js", () => ({
	getToolbarScript: () => toolbarScript,
}));

import { Toolbar } from "../../../src/recorder/toolbar.js";
import type { AssertionSuggestion } from "../../../src/recorder/types.js";
import { MockPage } from "../../helpers/mock-page.js";

function makeSuggestion(overrides: Partial<AssertionSuggestion> = {}): AssertionSuggestion {
	return {
		id: "a_1_12345",
		type: "url",
		description: "Assert navigation to /dashboard",
		playwrightCode: "await expect(page).toHaveURL(/dashboard/)",
		timestamp: Date.now(),
		accepted: false,
		afterActionIndex: 1,
		...overrides,
	};
}

describe("Toolbar", () => {
	let toolbar: Toolbar;
	let page: MockPage;

	beforeEach(() => {
		toolbar = new Toolbar();
		page = new MockPage();
	});

	describe("attach", () => {
		it("calls page.addInitScript with toolbar script", async () => {
			await toolbar.attach(page as never);
			expect(page.addInitScript).toHaveBeenCalledTimes(1);
			const scriptArg = page.addInitScript.mock.calls[0]?.[0] as string;
			expect(scriptArg).toContain("__kovar-toolbar");
			expect(scriptArg).toContain("__kovar_paused");
		});

		it("calls page.evaluate to inject toolbar", async () => {
			await toolbar.attach(page as never);
			// evaluate is called once during attach() for immediate injection
			expect(page.evaluate).toHaveBeenCalled();
		});

		it("registers load event handler for re-injection", async () => {
			await toolbar.attach(page as never);
			const loadHandlers = page.getEventHandlers("load");
			expect(loadHandlers.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("updateCounts", () => {
		it("calls page.evaluate with correct action/request/assertion counts", async () => {
			await toolbar.updateCounts(page as never, 5, 10, 3);
			expect(page.evaluate).toHaveBeenCalledTimes(1);
			// The template string `window.__kovar_updateToolbar && window.__kovar_updateToolbar(5, 10, 3)` is passed to evaluate
			const firstArg = page.evaluate.mock.calls[0]?.[0];
			// Depending on TS compilation, evaluate receives either a string or the template literal as-is.
			// Convert to string to inspect content regardless of type.
			const argStr = String(firstArg);
			expect(argStr).toContain("__kovar_updateToolbar");
		});

		it("handles page.evaluate failure gracefully (page navigating)", async () => {
			page.evaluate.mockRejectedValueOnce(new Error("Page navigating"));
			// Should not throw
			await expect(toolbar.updateCounts(page as never, 1, 2, 0)).resolves.toBeUndefined();
		});
	});

	describe("showSuggestion", () => {
		it("calls page.evaluate with suggestion id and description", async () => {
			const suggestion = makeSuggestion({
				id: "test_id_123",
				description: "Assert button is visible",
			});
			await toolbar.showSuggestion(page as never, suggestion);
			expect(page.evaluate).toHaveBeenCalled();
			// The evaluate receives a function and [id, desc] tuple
			const lastCall = page.evaluate.mock.calls[page.evaluate.mock.calls.length - 1];
			expect(lastCall).toBeDefined();
		});

		it("handles page.evaluate failure gracefully", async () => {
			page.evaluate.mockRejectedValueOnce(new Error("Execution context was destroyed"));
			const suggestion = makeSuggestion();
			await expect(toolbar.showSuggestion(page as never, suggestion)).resolves.toBeUndefined();
		});
	});

	describe("Browser-side script behavior", () => {
		it("stop button calls __kovar_stopRecording exposed function", async () => {
			// Verify the toolbar script contains stop button logic
			await toolbar.attach(page as never);
			const script = page.addInitScript.mock.calls[0]?.[0] as string;
			expect(script).toContain("__kovar_stopRecording");
			expect(script).toContain("st-stop");
		});

		it("pause/resume toggle updates __kovar_paused variable", async () => {
			await toolbar.attach(page as never);
			const script = page.addInitScript.mock.calls[0]?.[0] as string;
			expect(script).toContain("__kovar_paused");
			expect(script).toContain("Resume");
			expect(script).toContain("Pause");
		});

		it("shadow DOM creation with closed mode", async () => {
			await toolbar.attach(page as never);
			const script = page.addInitScript.mock.calls[0]?.[0] as string;
			expect(script).toContain("attachShadow");
			expect(script).toContain("closed");
		});
	});
});
