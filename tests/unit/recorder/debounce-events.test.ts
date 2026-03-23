import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for click/input debouncing and pause flag from ACTION_CAPTURE_SCRIPT.
 *
 * Strategy: We build a minimal browser-like environment (DOM + window globals),
 * then evaluate the IIFE from action-capture.ts to exercise its event listeners.
 */

// ── Helpers to build a minimal DOM environment ──

function createMockElement(overrides: Record<string, unknown> = {}) {
	const el: Record<string, unknown> = {
		tagName: "BUTTON",
		type: "button",
		id: "",
		name: "",
		value: "",
		href: null,
		innerText: "Click me",
		textContent: "Click me",
		checked: false,
		disabled: false,
		className: "",
		parentElement: null,
		children: [],
		closest: () => null,
		getAttribute: (attr: string) => {
			const attrs: Record<string, string | null> = {
				role: null,
				"aria-label": null,
				"aria-labelledby": null,
				"aria-describedby": null,
				"aria-expanded": null,
				"aria-selected": null,
				"aria-disabled": null,
				"data-testid": null,
				name: null,
				placeholder: null,
				"data-kovar-file": null,
				"data-kovar-line": null,
				"data-kovar-col": null,
				...(overrides.attrs as Record<string, string | null> | undefined),
			};
			return attrs[attr] ?? null;
		},
		hasAttribute: () => false,
		getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 30 }),
		querySelector: () => null,
		querySelectorAll: () => [],
		...overrides,
	};
	if (!el.parentElement) {
		el.parentElement = {
			tagName: "DIV",
			children: [el],
			textContent: "Click me",
			getAttribute: () => null,
			closest: () => null,
		};
	}
	return el;
}

function setupBrowserEnv() {
	const listeners: Record<string, Array<(e: unknown) => void>> = {};
	const recordedActions: string[] = [];
	const recordedDeltas: string[] = [];

	const mockWindow: Record<string, unknown> = {
		__kovar_capturing: false,
		__kovar_paused: false,
		__kovar_recordAction: (json: string) => recordedActions.push(json),
		__kovar_attachDelta: (json: string) => recordedDeltas.push(json),
		location: { href: "http://localhost:3000/page" },
	};

	const mockDocument: Record<string, unknown> = {
		addEventListener: (event: string, handler: (e: unknown) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(handler);
		},
		documentElement: {
			tagName: "HTML",
			getAttribute: () => null,
		},
		getElementById: () => null,
		querySelector: () => null,
	};

	const mockHistory: Record<string, unknown> = {
		pushState: () => {},
		replaceState: () => {},
	};

	const mockCSS: Record<string, unknown> = {
		escape: (s: string) => s,
	};

	const mockObserverInstances: Array<{ observe: ReturnType<typeof vi.fn> }> = [];
	const MockMutationObserver = vi.fn().mockImplementation(() => {
		const instance = { observe: vi.fn(), disconnect: vi.fn() };
		mockObserverInstances.push(instance);
		return instance;
	});

	return {
		listeners,
		recordedActions,
		recordedDeltas,
		mockWindow,
		mockDocument,
		mockHistory,
		mockCSS,
		MockMutationObserver,
		mockObserverInstances,
		dispatch(event: string, eventObj: unknown) {
			for (const handler of listeners[event] ?? []) {
				handler(eventObj);
			}
		},
	};
}

function evaluateActionCaptureScript(env: ReturnType<typeof setupBrowserEnv>) {
	// We run the IIFE by wrapping it so that `window`, `document`, `history`, `CSS`, and
	// `MutationObserver` come from our mock environment.
	const scriptBody = `
		var CLICK_DEBOUNCE = 50;
		var INPUT_DEBOUNCE = 300;
		var MAX_TEXT_LENGTH = 100;
		var MAX_ANCESTORS = 5;
		var MAX_SIBLINGS = 8;
		var MAX_FORM_FIELDS = 15;
		var DELTA_FLUSH_DELAY = 400;
		var lastClickTime = 0;
		var inputTimers = {};

		var lastUrl = window.location.href;
		var mutationBuffer = { addedText: [], removedText: [], addedElements: [], removedElements: [] };
		var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, META: 1, LINK: 1, BR: 1, HR: 1 };

		function getVisibleText(node) { return ''; }
		function nodeToSummary(node) { return null; }

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

		function truncate(str, max) {
			if (!str) return null;
			str = str.trim();
			return str.length > max ? str.substring(0, max) + '...' : str;
		}

		function maskValue(el, value) { return value; }

		function getRole(el) {
			var explicit = el.getAttribute('role');
			if (explicit) return explicit;
			var tag = el.tagName.toLowerCase();
			var type = (el.type || '').toLowerCase();
			if (tag === 'button' || (tag === 'input' && type === 'submit')) return 'button';
			if (tag === 'a' && el.href) return 'link';
			if (tag === 'select') return 'combobox';
			return null;
		}

		function getAriaLabel(el) { return el.getAttribute('aria-label'); }

		function captureElement(el) {
			var rect = el.getBoundingClientRect();
			return {
				tagName: el.tagName.toLowerCase(),
				role: getRole(el),
				ariaLabel: getAriaLabel(el),
				text: truncate(el.innerText || el.textContent, MAX_TEXT_LENGTH),
				placeholder: el.getAttribute('placeholder'),
				testId: el.getAttribute('data-testid'),
				name: el.getAttribute('name'),
				id: el.id || null,
				type: el.type || null,
				href: el.href || null,
				cssSelector: el.tagName.toLowerCase(),
				parentText: null,
				boundingRect: { x: 0, y: 0, width: 0, height: 0 },
				siblingIndex: 0,
				siblingCount: 1,
			};
		}

		function captureDOMContext(el) {
			return { ancestors: [], siblings: [], formContext: null, landmark: null };
		}

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

		function emitWithContext(type, el, extras) {
			var now = Date.now();
			var action = {
				actionId: ++actionIdCounter,
				type: type,
				timestamp: now,
				url: safeUrl(),
				element: captureElement(el),
				domContext: captureDOMContext(el),
				value: extras.value,
				key: extras.key,
				modifiers: extras.modifiers
			};
			emit(action);
		}

		document.addEventListener('click', function(e) {
			var now = Date.now();
			if (now - lastClickTime < CLICK_DEBOUNCE) return;
			lastClickTime = now;
			var el = e.target;
			if (el.closest && el.closest('#__kovar-toolbar')) return;
			emitWithContext('click', el, {});
		}, true);

		document.addEventListener('input', function(e) {
			var el = e.target;
			if (el.closest && el.closest('#__kovar-toolbar')) return;
			var key = el.id || el.name || (el.tagName + '_' + Array.from(el.parentElement.children).indexOf(el));
			if (inputTimers[key]) clearTimeout(inputTimers[key]);
			inputTimers[key] = setTimeout(function() {
				var value = maskValue(el, el.value);
				emitWithContext('input', el, { value: value });
			}, INPUT_DEBOUNCE);
		}, true);

		document.addEventListener('change', function(e) {
			var el = e.target;
			if (el.closest && el.closest('#__kovar-toolbar')) return;
			if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password' || el.type === 'email' || el.type === 'search')) return;
			var value = el.value;
			if (el.type === 'checkbox' || el.type === 'radio') {
				value = el.checked ? 'checked' : 'unchecked';
			}
			emitWithContext('change', el, { value: value });
		}, true);
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

describe("ACTION_CAPTURE_SCRIPT — Click debouncing", () => {
	let env: ReturnType<typeof setupBrowserEnv>;

	beforeEach(() => {
		vi.useFakeTimers();
		env = setupBrowserEnv();
		evaluateActionCaptureScript(env);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("ignores second click within CLICK_DEBOUNCE (50ms)", () => {
		const el = createMockElement();
		env.dispatch("click", { target: el });
		expect(env.recordedActions).toHaveLength(1);

		vi.advanceTimersByTime(30); // 30ms < 50ms debounce
		env.dispatch("click", { target: el });
		expect(env.recordedActions).toHaveLength(1); // still 1
	});

	it("allows click after debounce period", () => {
		const el = createMockElement();
		env.dispatch("click", { target: el });
		expect(env.recordedActions).toHaveLength(1);

		vi.advanceTimersByTime(60); // 60ms > 50ms debounce
		env.dispatch("click", { target: el });
		expect(env.recordedActions).toHaveLength(2);
	});
});

describe("ACTION_CAPTURE_SCRIPT — Input debouncing", () => {
	let env: ReturnType<typeof setupBrowserEnv>;

	beforeEach(() => {
		vi.useFakeTimers();
		env = setupBrowserEnv();
		evaluateActionCaptureScript(env);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("rapid keystrokes within INPUT_DEBOUNCE (300ms) produce single event with final value", () => {
		const el = createMockElement({
			tagName: "INPUT",
			type: "text",
			id: "username",
			value: "",
		});

		// Simulate rapid typing
		(el as Record<string, unknown>).value = "h";
		env.dispatch("input", { target: el });

		vi.advanceTimersByTime(50);
		(el as Record<string, unknown>).value = "he";
		env.dispatch("input", { target: el });

		vi.advanceTimersByTime(50);
		(el as Record<string, unknown>).value = "hel";
		env.dispatch("input", { target: el });

		vi.advanceTimersByTime(50);
		(el as Record<string, unknown>).value = "hello";
		env.dispatch("input", { target: el });

		// Before debounce fires: no input actions yet
		expect(env.recordedActions).toHaveLength(0);

		// Fire the debounce timer
		vi.advanceTimersByTime(300);
		expect(env.recordedActions).toHaveLength(1);

		const action = JSON.parse(env.recordedActions[0]);
		expect(action.type).toBe("input");
		expect(action.value).toBe("hello");
	});

	it("input after debounce period produces separate event", () => {
		const el = createMockElement({
			tagName: "INPUT",
			type: "text",
			id: "field1",
			value: "first",
		});

		env.dispatch("input", { target: el });
		vi.advanceTimersByTime(300); // debounce fires
		expect(env.recordedActions).toHaveLength(1);

		(el as Record<string, unknown>).value = "second";
		env.dispatch("input", { target: el });
		vi.advanceTimersByTime(300); // second debounce fires
		expect(env.recordedActions).toHaveLength(2);

		const first = JSON.parse(env.recordedActions[0]);
		const second = JSON.parse(env.recordedActions[1]);
		expect(first.value).toBe("first");
		expect(second.value).toBe("second");
	});
});

describe("ACTION_CAPTURE_SCRIPT — Change event filtering", () => {
	let env: ReturnType<typeof setupBrowserEnv>;

	beforeEach(() => {
		vi.useFakeTimers();
		env = setupBrowserEnv();
		evaluateActionCaptureScript(env);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("captures change events for select elements", () => {
		const el = createMockElement({
			tagName: "SELECT",
			type: "select-one",
			value: "option2",
		});
		env.dispatch("change", { target: el });
		expect(env.recordedActions).toHaveLength(1);
		const action = JSON.parse(env.recordedActions[0]);
		expect(action.type).toBe("change");
		expect(action.value).toBe("option2");
	});

	it("captures change events for checkbox with checked/unchecked value", () => {
		const el = createMockElement({
			tagName: "INPUT",
			type: "checkbox",
			checked: true,
			value: "on",
		});
		env.dispatch("change", { target: el });
		expect(env.recordedActions).toHaveLength(1);
		const action = JSON.parse(env.recordedActions[0]);
		expect(action.type).toBe("change");
		expect(action.value).toBe("checked");
	});

	it("captures change events for radio with checked/unchecked value", () => {
		const el = createMockElement({
			tagName: "INPUT",
			type: "radio",
			checked: false,
			value: "option1",
		});
		env.dispatch("change", { target: el });
		expect(env.recordedActions).toHaveLength(1);
		const action = JSON.parse(env.recordedActions[0]);
		expect(action.value).toBe("unchecked");
	});

	it("does NOT capture change events for text inputs (filtered out)", () => {
		const textEl = createMockElement({ tagName: "INPUT", type: "text", value: "hello" });
		env.dispatch("change", { target: textEl });
		expect(env.recordedActions).toHaveLength(0);

		const passwordEl = createMockElement({ tagName: "INPUT", type: "password", value: "secret" });
		env.dispatch("change", { target: passwordEl });
		expect(env.recordedActions).toHaveLength(0);

		const emailEl = createMockElement({ tagName: "INPUT", type: "email", value: "a@b.com" });
		env.dispatch("change", { target: emailEl });
		expect(env.recordedActions).toHaveLength(0);
	});
});

describe("ACTION_CAPTURE_SCRIPT — __kovar_paused flag", () => {
	let env: ReturnType<typeof setupBrowserEnv>;

	beforeEach(() => {
		vi.useFakeTimers();
		env = setupBrowserEnv();
		evaluateActionCaptureScript(env);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("events are NOT captured when paused", () => {
		env.mockWindow.__kovar_paused = true;
		const el = createMockElement();
		env.dispatch("click", { target: el });
		expect(env.recordedActions).toHaveLength(0);
	});

	it("events resume after unpause", () => {
		env.mockWindow.__kovar_paused = true;
		const el = createMockElement();
		env.dispatch("click", { target: el });
		expect(env.recordedActions).toHaveLength(0);

		env.mockWindow.__kovar_paused = false;
		vi.advanceTimersByTime(60); // past debounce
		env.dispatch("click", { target: el });
		expect(env.recordedActions).toHaveLength(1);
	});
});
