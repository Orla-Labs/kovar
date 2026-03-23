/**
 * Browser entry point for action capture.
 * Bundled into an IIFE at build time and injected via page.addInitScript().
 *
 * Imports pure functions from typed modules; contains event listener setup,
 * emit/emitWithContext, SPA monkey-patching, and MutationObserver wiring.
 */

import { maskValue } from "./mask-value.js";
import {
	LANDMARK_ROLES,
	LANDMARK_TAGS,
	SKIP_TAGS,
	captureElement,
	captureDOMContext,
	getLandmark,
	getRole,
	getAriaLabel,
	getVisibleText,
	nodeToSummary,
	truncate,
} from "./dom-context.js";
import { createMutationBuffer, processMutations, flushDelta } from "./delta-tracker.js";
import type { MutationBufferData } from "./delta-tracker.js";

declare const window: Record<string, unknown> & Window;

(function () {
	if ((window as Record<string, unknown>).__kovar_capturing) return;
	(window as Record<string, unknown>).__kovar_capturing = true;

	const CLICK_DEBOUNCE = 50;
	const DOUBLE_CLICK_WINDOW = 500;
	const INPUT_DEBOUNCE = 300;
	const MAX_TEXT_LENGTH = 100;
	const MAX_ANCESTORS = 5;
	const MAX_SIBLINGS = 8;
	const MAX_FORM_FIELDS = 15;
	const DELTA_FLUSH_DELAY = 400;
	let lastClickTime = 0;
	let lastClickTarget: EventTarget | null = null;
	let lastClickCount = 0;
	const inputTimers: Record<string, ReturnType<typeof setTimeout>> = {};

	// -- State Tracking (MutationObserver) --

	let lastUrl = window.location.href;
	let mutationBuffer: MutationBufferData = createMutationBuffer();

	// -- Shared MutationObserver (dispatches to delta tracker AND assertion detector) --

	const observer = new MutationObserver(function (mutations) {
		processMutations(mutations, mutationBuffer);
		if (typeof (window as Record<string, unknown>).__kovar_assertionMutationHandler === "function") {
			(
				(window as Record<string, unknown>).__kovar_assertionMutationHandler as (
					m: MutationRecord[],
				) => void
			)(mutations);
		}
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });

	function doFlushDelta() {
		const currentUrl = window.location.href;
		const result = flushDelta(mutationBuffer, lastUrl, currentUrl);
		lastUrl = result.newLastUrl;
		mutationBuffer = result.newBuffer;
		return result.delta;
	}

	// -- Core Capture Functions --

	function safeUrl() {
		try {
			const u = new URL(window.location.href);
			return u.origin + u.pathname;
		} catch (_e) {
			return window.location.href.split("?")[0]!;
		}
	}

	function maskValueBrowser(el: HTMLInputElement, value: string): string {
		return maskValue(el.type || "", el.getAttribute("name") || "", el.getAttribute("placeholder") || "", value);
	}

	// -- Emit with Rich Context --

	let actionIdCounter = 0;
	let pendingDeltaTimer: ReturnType<typeof setTimeout> | null = null;
	let lastEmittedActionId: number | null = null;

	function emit(action: Record<string, unknown>) {
		if ((window as Record<string, unknown>).__kovar_paused) return;

		// Clear any pending delta flush before processing new action
		if (pendingDeltaTimer) {
			clearTimeout(pendingDeltaTimer);
			pendingDeltaTimer = null;
		}

		// Attach delta from PREVIOUS action's aftermath
		const delta = doFlushDelta();
		if (delta && lastEmittedActionId !== null && (window as Record<string, unknown>).__kovar_attachDelta) {
			(
				(window as Record<string, unknown>).__kovar_attachDelta as (json: string) => void
			)(JSON.stringify({ actionId: lastEmittedActionId, delta: delta }));
		}

		lastEmittedActionId = action.actionId as number;

		if ((window as Record<string, unknown>).__kovar_recordAction) {
			(
				(window as Record<string, unknown>).__kovar_recordAction as (json: string) => void
			)(JSON.stringify(action));
		}

		// Schedule a delayed delta flush for this action
		const currentActionId = action.actionId;
		pendingDeltaTimer = setTimeout(function () {
			pendingDeltaTimer = null;
			const finalDelta = doFlushDelta();
			if (finalDelta && (window as Record<string, unknown>).__kovar_attachDelta) {
				(
					(window as Record<string, unknown>).__kovar_attachDelta as (json: string) => void
				)(JSON.stringify({ actionId: currentActionId, delta: finalDelta }));
			}
		}, DELTA_FLUSH_DELAY);
	}

	function emitWithContext(
		type: string,
		el: Element,
		extras: { value?: string; key?: string; modifiers?: string[] },
	) {
		const now = Date.now();
		const action = {
			actionId: ++actionIdCounter,
			type: type,
			timestamp: now,
			url: safeUrl(),
			element: captureElement(el, MAX_TEXT_LENGTH),
			domContext: captureDOMContext(el, MAX_ANCESTORS, MAX_SIBLINGS, MAX_FORM_FIELDS, MAX_TEXT_LENGTH),
			value: extras.value,
			key: extras.key,
			modifiers: extras.modifiers,
		};
		emit(action);
	}

	document.addEventListener(
		"click",
		function (e: MouseEvent) {
			const now = Date.now();
			const el = e.target as Element;

			// Double-click detection: same target within DOUBLE_CLICK_WINDOW
			if (el === lastClickTarget && now - lastClickTime < DOUBLE_CLICK_WINDOW) {
				lastClickCount++;
				if (lastClickCount === 2) {
					lastClickTime = now;
					if (el.closest && el.closest("#__kovar-toolbar")) return;
					emitWithContext("click", el, { value: "dblclick" });
					return;
				}
			} else {
				lastClickCount = 1;
			}

			if (now - lastClickTime < CLICK_DEBOUNCE) return;
			lastClickTime = now;
			lastClickTarget = el;

			if (el.closest && el.closest("#__kovar-toolbar")) return;

			emitWithContext("click", el, {});
		},
		true,
	);

	document.addEventListener(
		"input",
		function (e: Event) {
			const el = e.target as HTMLInputElement;
			if (el.closest && el.closest("#__kovar-toolbar")) return;

			const key =
				el.id ||
				el.name ||
				el.tagName + "_" + Array.from(el.parentElement ? el.parentElement.children : []).indexOf(el);
			if (inputTimers[key]) clearTimeout(inputTimers[key]);

			inputTimers[key] = setTimeout(function () {
				const value = maskValueBrowser(el, el.value);
				emitWithContext("input", el, { value: value });
			}, INPUT_DEBOUNCE);
		},
		true,
	);

	document.addEventListener(
		"change",
		function (e: Event) {
			const el = e.target as HTMLInputElement;
			if (el.closest && el.closest("#__kovar-toolbar")) return;
			if (
				el.tagName === "INPUT" &&
				(el.type === "text" || el.type === "password" || el.type === "email" || el.type === "search")
			)
				return;

			let value = el.value;
			if (el.type === "checkbox" || el.type === "radio") {
				value = el.checked ? "checked" : "unchecked";
			} else {
				value = maskValueBrowser(el, value);
			}

			emitWithContext("change", el, { value: value });
		},
		true,
	);

	document.addEventListener(
		"keydown",
		function (e: KeyboardEvent) {
			if (e.key !== "Enter" && e.key !== "Tab" && e.key !== "Escape") return;
			const el = e.target as Element;
			if (el.closest && el.closest("#__kovar-toolbar")) return;

			const modifiers: string[] = [];
			if (e.ctrlKey) modifiers.push("Ctrl");
			if (e.shiftKey) modifiers.push("Shift");
			if (e.altKey) modifiers.push("Alt");
			if (e.metaKey) modifiers.push("Meta");

			emitWithContext("keypress", el, {
				key: e.key,
				modifiers: modifiers.length > 0 ? modifiers : undefined,
			});
		},
		true,
	);

	// Monitor SPA navigation
	(window as Record<string, unknown>).__kovar_lastSpaNav = { url: "", time: 0 };

	function emitNavigation() {
		const url = safeUrl();
		const now = Date.now();

		// Flush any pending delta before navigation resets context
		if (pendingDeltaTimer) {
			clearTimeout(pendingDeltaTimer);
			pendingDeltaTimer = null;
			const finalDelta = doFlushDelta();
			if (finalDelta && lastEmittedActionId !== null && (window as Record<string, unknown>).__kovar_attachDelta) {
				(
					(window as Record<string, unknown>).__kovar_attachDelta as (json: string) => void
				)(JSON.stringify({ actionId: lastEmittedActionId, delta: finalDelta }));
			}
		}

		emit({ type: "navigation", timestamp: now, url: url, element: null });
	}

	const origPushState = history.pushState;
	const origReplaceState = history.replaceState;
	history.pushState = function (...args: Parameters<typeof origPushState>) {
		origPushState.apply(this, args);
		const url = safeUrl();
		(window as Record<string, unknown>).__kovar_lastSpaNav = { url: url, time: Date.now() };
		emitNavigation();
	};
	history.replaceState = function (...args: Parameters<typeof origReplaceState>) {
		origReplaceState.apply(this, args);
		const url = safeUrl();
		(window as Record<string, unknown>).__kovar_lastSpaNav = { url: url, time: Date.now() };
		emitNavigation();
	};
	window.addEventListener("popstate", function () {
		const url = safeUrl();
		(window as Record<string, unknown>).__kovar_lastSpaNav = { url: url, time: Date.now() };
		emitNavigation();
	});
})();
