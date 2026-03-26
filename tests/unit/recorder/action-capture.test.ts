import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/recorder/browser-scripts.js", () => ({
	getActionCaptureScript: () => "// mock browser script",
}));

import { ActionCapture } from "../../../src/recorder/action-capture.js";
import type { RecordedAction } from "../../../src/recorder/types.js";
import { MockPage } from "../../helpers/mock-page.js";

function makeValidAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
	return {
		actionId: 1,
		type: "click",
		timestamp: Date.now(),
		url: "https://example.com",
		element: null,
		...overrides,
	};
}

describe("ActionCapture", () => {
	let page: MockPage;
	let capture: ActionCapture;

	beforeEach(() => {
		page = new MockPage();
		capture = new ActionCapture();
	});

	async function attachAndGetCallbacks() {
		await capture.attach(page as never);
		const recordAction = page.getExposedFunction("__kovar_recordAction") as (json: string) => void;
		const attachDelta = page.getExposedFunction("__kovar_attachDelta") as (json: string) => void;
		const framenavigatedHandlers = page.getEventHandlers("framenavigated");
		return { recordAction, attachDelta, framenavigatedHandlers };
	}

	describe("__kovar_recordAction callback", () => {
		it("receives valid JSON and pushes to actions array", async () => {
			const { recordAction } = await attachAndGetCallbacks();
			const action = makeValidAction();
			recordAction(JSON.stringify(action));
			expect(capture.getActions()).toHaveLength(1);
			expect(capture.getActions()[0]?.type).toBe("click");
		});

		it("ignores malformed JSON without throwing", async () => {
			const { recordAction } = await attachAndGetCallbacks();
			expect(() => recordAction("not-valid-json{{{")).not.toThrow();
			expect(capture.getActions()).toHaveLength(0);
		});

		it("respects maxActions limit — action #201 is dropped", async () => {
			const limitedCapture = new ActionCapture(200);
			const limitedPage = new MockPage();
			await limitedCapture.attach(limitedPage as never);
			const recordAction = limitedPage.getExposedFunction("__kovar_recordAction") as (
				json: string,
			) => void;

			for (let i = 0; i < 201; i++) {
				recordAction(JSON.stringify(makeValidAction({ actionId: i + 1 })));
			}
			expect(limitedCapture.getActionCount()).toBe(200);
		});

		it("updates lastActivityTime on each action", async () => {
			const { recordAction } = await attachAndGetCallbacks();
			const timeBefore = capture.getLastActivityTime();

			// Small delay to ensure timestamp difference
			await new Promise((r) => setTimeout(r, 10));

			recordAction(JSON.stringify(makeValidAction()));
			expect(capture.getLastActivityTime()).toBeGreaterThanOrEqual(timeBefore);
		});
	});

	describe("__kovar_attachDelta callback", () => {
		it("attaches delta to matching action by actionId", async () => {
			const { recordAction, attachDelta } = await attachAndGetCallbacks();
			recordAction(JSON.stringify(makeValidAction({ actionId: 42 })));

			const delta = {
				urlChanged: true,
				newUrl: "https://example.com/next",
				addedText: ["Hello"],
				removedText: [],
				addedElements: [],
				removedElements: [],
			};
			attachDelta(JSON.stringify({ actionId: 42, delta }));

			const actions = capture.getActions();
			expect(actions[0]?.delta).toBeDefined();
			expect(actions[0]?.delta?.urlChanged).toBe(true);
			expect(actions[0]?.delta?.addedText).toEqual(["Hello"]);
		});

		it("merges second delta into existing delta (addedText concat, urlChanged OR-merge)", async () => {
			const { recordAction, attachDelta } = await attachAndGetCallbacks();
			recordAction(JSON.stringify(makeValidAction({ actionId: 10 })));

			const delta1 = {
				urlChanged: false,
				newUrl: null,
				addedText: ["First"],
				removedText: [],
				addedElements: [],
				removedElements: [],
			};
			attachDelta(JSON.stringify({ actionId: 10, delta: delta1 }));

			const delta2 = {
				urlChanged: true,
				newUrl: "https://example.com/page2",
				addedText: ["Second"],
				removedText: ["Gone"],
				addedElements: [{ tagName: "div", role: null, text: "New" }],
				removedElements: [],
			};
			attachDelta(JSON.stringify({ actionId: 10, delta: delta2 }));

			const merged = capture.getActions()[0]?.delta;
			expect(merged?.addedText).toEqual(["First", "Second"]);
			expect(merged?.removedText).toEqual(["Gone"]);
			expect(merged?.urlChanged).toBe(true);
			expect(merged?.newUrl).toBe("https://example.com/page2");
			expect(merged?.addedElements).toHaveLength(1);
		});

		it("ignores delta for non-existent actionId", async () => {
			const { recordAction, attachDelta } = await attachAndGetCallbacks();
			recordAction(JSON.stringify(makeValidAction({ actionId: 1 })));

			const delta = {
				urlChanged: false,
				newUrl: null,
				addedText: ["Orphan"],
				removedText: [],
				addedElements: [],
				removedElements: [],
			};
			attachDelta(JSON.stringify({ actionId: 999, delta }));

			expect(capture.getActions()[0]?.delta).toBeUndefined();
		});

		it("ignores malformed JSON", async () => {
			const { attachDelta } = await attachAndGetCallbacks();
			expect(() => attachDelta("not-valid-json")).not.toThrow();
		});

		it("ignores null delta payload", async () => {
			const { recordAction, attachDelta } = await attachAndGetCallbacks();
			recordAction(JSON.stringify(makeValidAction({ actionId: 1 })));
			attachDelta(JSON.stringify({ actionId: 1, delta: null }));
			expect(capture.getActions()[0]?.delta).toBeUndefined();
		});
	});

	describe("framenavigated listener", () => {
		it("pushes navigation action on main frame navigation", async () => {
			const { framenavigatedHandlers } = await attachAndGetCallbacks();
			expect(framenavigatedHandlers).toHaveLength(1);

			const mainFrame = page.mainFrame();
			page.setUrl("https://example.com/navigated");

			// Trigger both framenavigated handlers with the main frame
			for (const handler of framenavigatedHandlers) {
				await handler!(mainFrame);
			}

			const actions = capture.getActions();
			expect(actions).toHaveLength(1);
			expect(actions[0]?.type).toBe("navigation");
			expect(actions[0]?.url).toBe("https://example.com/navigated");
			expect(actions[0]?.element).toBeNull();
		});

		it("ignores sub-frame navigations", async () => {
			const { framenavigatedHandlers } = await attachAndGetCallbacks();

			const subFrame = {
				url: () => "https://sub.example.com",
				name: () => "iframe",
				evaluate: vi.fn().mockResolvedValue(undefined),
			};

			// Trigger all framenavigated handlers with the sub-frame
			for (const handler of framenavigatedHandlers) {
				await handler!(subFrame);
			}

			// No navigation action should be recorded for sub-frames
			expect(capture.getActions()).toHaveLength(0);
		});
	});

	describe("getActions", () => {
		it("returns captured actions", async () => {
			const { recordAction } = await attachAndGetCallbacks();
			recordAction(JSON.stringify(makeValidAction({ actionId: 1, type: "click" })));
			recordAction(JSON.stringify(makeValidAction({ actionId: 2, type: "input" })));

			const actions = capture.getActions();
			expect(actions).toHaveLength(2);
			expect(actions[0]?.type).toBe("click");
			expect(actions[1]?.type).toBe("input");
		});
	});

	describe("getActionCount", () => {
		it("returns correct count", async () => {
			const { recordAction } = await attachAndGetCallbacks();
			expect(capture.getActionCount()).toBe(0);
			recordAction(JSON.stringify(makeValidAction()));
			expect(capture.getActionCount()).toBe(1);
			recordAction(JSON.stringify(makeValidAction({ actionId: 2 })));
			expect(capture.getActionCount()).toBe(2);
		});
	});

	describe("getLastActivityTime", () => {
		it("returns updated timestamp", async () => {
			const initialTime = capture.getLastActivityTime();
			expect(initialTime).toBeGreaterThan(0);

			await new Promise((r) => setTimeout(r, 10));

			const { recordAction } = await attachAndGetCallbacks();
			recordAction(JSON.stringify(makeValidAction()));

			expect(capture.getLastActivityTime()).toBeGreaterThanOrEqual(initialTime);
		});
	});
});
