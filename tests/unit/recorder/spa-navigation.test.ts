import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for SPA navigation detection from ACTION_CAPTURE_SCRIPT.
 *
 * Strategy: We build a minimal browser-like environment with mocked
 * history.pushState / replaceState, inject the relevant portion of
 * the capture script, and verify navigation actions are emitted.
 */

function setupBrowserEnv() {
	const listeners: Record<string, Array<(e: unknown) => void>> = {};
	const recordedActions: string[] = [];
	const recordedDeltas: string[] = [];

	let currentHref = "http://localhost:3000/page";

	const mockWindow: Record<string, unknown> = {
		__kovar_capturing: false,
		__kovar_paused: false,
		__kovar_recordAction: (json: string) => recordedActions.push(json),
		__kovar_attachDelta: (json: string) => recordedDeltas.push(json),
		location: {
			get href() {
				return currentHref;
			},
			set href(val: string) {
				currentHref = val;
			},
		},
		addEventListener: (event: string, handler: (e: unknown) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(handler);
		},
	};

	const mockDocument: Record<string, unknown> = {
		addEventListener: () => {},
		documentElement: { tagName: "HTML", getAttribute: () => null },
		getElementById: () => null,
		querySelector: () => null,
	};

	const origPushState = vi.fn();
	const origReplaceState = vi.fn();

	const mockHistory: Record<string, unknown> = {
		pushState: origPushState,
		replaceState: origReplaceState,
	};

	const MockMutationObserver = vi.fn().mockImplementation(() => ({
		observe: vi.fn(),
		disconnect: vi.fn(),
	}));

	const mockCSS = { escape: (s: string) => s };

	return {
		listeners,
		recordedActions,
		recordedDeltas,
		mockWindow,
		mockDocument,
		mockHistory,
		mockCSS,
		MockMutationObserver,
		origPushState,
		origReplaceState,
		setHref(url: string) {
			currentHref = url;
		},
		dispatchWindowEvent(event: string, eventObj?: unknown) {
			for (const handler of listeners[event] ?? []) {
				handler(eventObj ?? {});
			}
		},
	};
}

function evaluateSPAScript(env: ReturnType<typeof setupBrowserEnv>) {
	const scriptBody = `
		var lastUrl = window.location.href;
		var mutationBuffer = { addedText: [], removedText: [], addedElements: [], removedElements: [] };

		var observer = new MutationObserver(function(){});
		observer.observe(document.documentElement, { childList: true, subtree: true });

		function flushDelta() {
			var currentUrl = window.location.href;
			var urlChanged = currentUrl !== lastUrl;
			var delta = {
				urlChanged: urlChanged,
				newUrl: urlChanged ? currentUrl.split('?')[0] : null,
				addedText: mutationBuffer.addedText.slice(),
				removedText: mutationBuffer.removedText.slice(),
				addedElements: mutationBuffer.addedElements.slice(),
				removedElements: mutationBuffer.removedElements.slice()
			};
			lastUrl = currentUrl;
			mutationBuffer = { addedText: [], removedText: [], addedElements: [], removedElements: [] };
			if (!delta.urlChanged && delta.addedText.length === 0 && delta.removedText.length === 0 &&
				delta.addedElements.length === 0 && delta.removedElements.length === 0) {
				return null;
			}
			return delta;
		}

		function safeUrl() {
			try { var u = new URL(window.location.href); return u.origin + u.pathname; }
			catch(e) { return window.location.href.split('?')[0]; }
		}

		var DELTA_FLUSH_DELAY = 400;
		var actionIdCounter = 0;
		var pendingDeltaTimer = null;
		var lastEmittedActionId = null;

		function emit(action) {
			if (window.__kovar_paused) return;
			var delta = flushDelta();
			if (delta && lastEmittedActionId !== null && window.__kovar_attachDelta) {
				window.__kovar_attachDelta(JSON.stringify({ actionId: lastEmittedActionId, delta: delta }));
			}
			lastEmittedActionId = action.actionId;
			if (window.__kovar_recordAction) {
				window.__kovar_recordAction(JSON.stringify(action));
			}
			var currentActionId = action.actionId;
			if (pendingDeltaTimer) clearTimeout(pendingDeltaTimer);
			pendingDeltaTimer = setTimeout(function() {
				var finalDelta = flushDelta();
				if (finalDelta && window.__kovar_attachDelta) {
					window.__kovar_attachDelta(JSON.stringify({ actionId: currentActionId, delta: finalDelta }));
				}
			}, DELTA_FLUSH_DELAY);
		}

		var origPushState = history.pushState;
		var origReplaceState = history.replaceState;

		history.pushState = function() {
			origPushState.apply(this, arguments);
			emit({ type: 'navigation', timestamp: Date.now(), url: safeUrl(), element: null });
		};

		history.replaceState = function() {
			origReplaceState.apply(this, arguments);
			emit({ type: 'navigation', timestamp: Date.now(), url: safeUrl(), element: null });
		};

		window.addEventListener('popstate', function() {
			emit({ type: 'navigation', timestamp: Date.now(), url: safeUrl(), element: null });
		});
	`;

	const fn = new Function(
		"window",
		"document",
		"history",
		"CSS",
		"MutationObserver",
		"Date",
		"setTimeout",
		"clearTimeout",
		"URL",
		"Array",
		"JSON",
		scriptBody,
	);

	fn(
		env.mockWindow,
		env.mockDocument,
		env.mockHistory,
		env.mockCSS,
		env.MockMutationObserver,
		Date,
		setTimeout,
		clearTimeout,
		URL,
		Array,
		JSON,
	);
}

describe("ACTION_CAPTURE_SCRIPT — SPA navigation detection", () => {
	let env: ReturnType<typeof setupBrowserEnv>;

	beforeEach(() => {
		vi.useFakeTimers();
		env = setupBrowserEnv();
		evaluateSPAScript(env);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("history.pushState triggers navigation action with new URL", () => {
		env.setHref("http://localhost:3000/new-page");
		(env.mockHistory.pushState as (...args: unknown[]) => void)({}, "", "/new-page");

		expect(env.recordedActions).toHaveLength(1);
		const action = JSON.parse(env.recordedActions[0]);
		expect(action.type).toBe("navigation");
		expect(action.url).toBe("http://localhost:3000/new-page");
	});

	it("history.replaceState triggers navigation action", () => {
		env.setHref("http://localhost:3000/replaced");
		(env.mockHistory.replaceState as (...args: unknown[]) => void)({}, "", "/replaced");

		expect(env.recordedActions).toHaveLength(1);
		const action = JSON.parse(env.recordedActions[0]);
		expect(action.type).toBe("navigation");
		expect(action.url).toBe("http://localhost:3000/replaced");
	});

	it("popstate event triggers navigation action", () => {
		env.setHref("http://localhost:3000/back-page");
		env.dispatchWindowEvent("popstate");

		expect(env.recordedActions).toHaveLength(1);
		const action = JSON.parse(env.recordedActions[0]);
		expect(action.type).toBe("navigation");
		expect(action.url).toBe("http://localhost:3000/back-page");
	});

	it("navigation stores correct fromUrl and toUrl via delta", () => {
		// First navigation — sets lastUrl
		env.setHref("http://localhost:3000/first");
		(env.mockHistory.pushState as (...args: unknown[]) => void)({}, "", "/first");

		expect(env.recordedActions).toHaveLength(1);
		const firstAction = JSON.parse(env.recordedActions[0]);
		expect(firstAction.url).toBe("http://localhost:3000/first");

		// Second navigation — should flush delta for the first action
		env.setHref("http://localhost:3000/second");
		(env.mockHistory.pushState as (...args: unknown[]) => void)({}, "", "/second");

		expect(env.recordedActions).toHaveLength(2);
		const secondAction = JSON.parse(env.recordedActions[1]);
		expect(secondAction.url).toBe("http://localhost:3000/second");

		// The delta from the first action should show the URL changed
		expect(env.recordedDeltas.length).toBeGreaterThanOrEqual(1);
		const delta = JSON.parse(env.recordedDeltas[0]);
		expect(delta.delta.urlChanged).toBe(true);
		expect(delta.delta.newUrl).toBe("http://localhost:3000/second");
	});

	it("original pushState/replaceState still work correctly (chaining)", () => {
		env.setHref("http://localhost:3000/chained");
		(env.mockHistory.pushState as (...args: unknown[]) => void)(
			{ key: "val" },
			"title",
			"/chained",
		);
		expect(env.origPushState).toHaveBeenCalledTimes(1);

		env.setHref("http://localhost:3000/replaced2");
		(env.mockHistory.replaceState as (...args: unknown[]) => void)({ k: "v" }, "", "/replaced2");
		expect(env.origReplaceState).toHaveBeenCalledTimes(1);

		// Both navigation actions were also emitted
		expect(env.recordedActions).toHaveLength(2);
	});
});
