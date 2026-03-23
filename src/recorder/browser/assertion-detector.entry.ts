/**
 * Browser entry point for assertion detection.
 * Bundled into an IIFE at build time and injected via page.addInitScript().
 *
 * Imports pure functions from typed modules; contains observer registration,
 * polling setup, and window global assignments.
 */

import {
	checkUrlChange,
	checkTitleChange,
	escapeRegex,
	genId,
	processAddedNode,
	processRemovedNode,
} from "./assertion-detection.js";
import type { MutationSuggestion } from "./assertion-detection.js";

declare const window: Record<string, unknown> & Window;

(function () {
	if ((window as Record<string, unknown>).__kovar_assertionDetector) return;
	(window as Record<string, unknown>).__kovar_assertionDetector = true;

	const MAX_SUGGESTIONS = 50;
	let suggestionCount = 0;
	let lastUrl = window.location.href;
	let lastTitle = document.title;
	let lastSuggestedUrl = lastUrl;
	let lastSuggestedTitle = lastTitle;
	const seenTexts = new Set<string>();
	let idCounter = 0;

	function suggest(type: string, description: string, playwrightCode: string) {
		if (suggestionCount >= MAX_SUGGESTIONS) return;
		suggestionCount++;
		const suggestion = {
			id: genId(++idCounter),
			type: type,
			description: description,
			playwrightCode: playwrightCode,
			timestamp: Date.now(),
			accepted: false,
			afterActionIndex:
				((window as Record<string, unknown>).__kovar_actionCount as number) || 0,
		};
		if (typeof (window as Record<string, unknown>).__kovar_suggestAssertion === "function") {
			(
				(window as Record<string, unknown>).__kovar_suggestAssertion as (
					json: string,
				) => void
			)(JSON.stringify(suggestion));
		}
	}

	// -- URL Change Detection (with dedup) --
	function checkUrl() {
		const currentUrl = window.location.href;
		const result = checkUrlChange(currentUrl, lastUrl, lastSuggestedUrl);
		lastUrl = result.newLastUrl;
		lastSuggestedUrl = result.newLastSuggestedUrl;
		if (result.suggestion) {
			suggest(
				result.suggestion.type,
				result.suggestion.description,
				result.suggestion.playwrightCode,
			);
		}
	}

	// -- Title Change Detection (with dedup) --
	function checkTitle() {
		const currentTitle = document.title;
		const result = checkTitleChange(currentTitle, lastTitle, lastSuggestedTitle);
		lastTitle = result.newLastTitle;
		lastSuggestedTitle = result.newLastSuggestedTitle;
		if (result.suggestion) {
			suggest(
				result.suggestion.type,
				result.suggestion.description,
				result.suggestion.playwrightCode,
			);
		}
	}

	// -- DOM Mutation Detection (uses shared observer from action-capture) --
	function handleMutations(mutations: MutationRecord[]) {
		for (let i = 0; i < mutations.length; i++) {
			const m = mutations[i]!;
			for (let j = 0; j < m.addedNodes.length; j++) {
				const node = m.addedNodes[j]!;
				if (node.nodeType !== 1) continue;
				const el = node as Element;
				const result: MutationSuggestion | null = processAddedNode(el, seenTexts);
				if (result) {
					suggest(result.type, result.description, result.playwrightCode);
				}
			}

			// Detect element removal (spinners, loading indicators)
			for (let k = 0; k < m.removedNodes.length; k++) {
				const removed = m.removedNodes[k]!;
				if (removed.nodeType !== 1) continue;
				const rEl = removed as Element;
				const result: MutationSuggestion | null = processRemovedNode(rEl);
				if (result) {
					suggest(result.type, result.description, result.playwrightCode);
				}
			}
		}
	}

	// Register as handler for the shared observer from action-capture
	(window as Record<string, unknown>).__kovar_assertionMutationHandler = handleMutations;

	// If action-capture hasn't loaded yet, set up own observer as fallback
	if (!(window as Record<string, unknown>).__kovar_capturing) {
		const fallbackObserver = new MutationObserver(handleMutations);
		fallbackObserver.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
		// Disconnect fallback when shared observer takes over
		const checkShared = setInterval(function () {
			if ((window as Record<string, unknown>).__kovar_capturing) {
				fallbackObserver.disconnect();
				clearInterval(checkShared);
			}
		}, 100);
	}

	// Poll for URL and title changes
	let pollIntervalId: ReturnType<typeof setInterval> | null = setInterval(function () {
		checkUrl();
		checkTitle();
	}, 300);

	// Expose cleanup function for Node-side teardown
	(window as Record<string, unknown>).__kovar_cleanupAssertionDetector = function () {
		if (pollIntervalId) {
			clearInterval(pollIntervalId);
			pollIntervalId = null;
		}
		(window as Record<string, unknown>).__kovar_assertionMutationHandler = null;
	};
})();
