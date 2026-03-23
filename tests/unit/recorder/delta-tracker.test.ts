import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for MutationObserver delta tracking from ACTION_CAPTURE_SCRIPT.
 *
 * We replicate the delta logic from the browser-side script in a testable way.
 * Since MutationObserver is available in JSDOM/happy-dom environments, we test
 * the flushDelta logic and mutation tracking using extracted function logic.
 */

interface DeltaBuffer {
	addedText: string[];
	removedText: string[];
	addedElements: Array<{ tagName: string; role: string | null; text: string | null }>;
	removedElements: Array<{ tagName: string; role: string | null; text: string | null }>;
}

interface DeltaResult {
	urlChanged: boolean;
	newUrl: string | null;
	addedText: string[];
	removedText: string[];
	addedElements: Array<{ tagName: string; role: string | null; text: string | null }>;
	removedElements: Array<{ tagName: string; role: string | null; text: string | null }>;
}

/**
 * Creates a testable delta tracking environment that replicates the
 * ACTION_CAPTURE_SCRIPT's mutation/delta logic.
 */
function createDeltaTracker(initialUrl = "https://example.com") {
	const SKIP_TAGS: Record<string, number> = {
		SCRIPT: 1,
		STYLE: 1,
		NOSCRIPT: 1,
		META: 1,
		LINK: 1,
		BR: 1,
		HR: 1,
	};

	let lastUrl = initialUrl;
	let currentUrl = initialUrl;
	let mutationBuffer: DeltaBuffer = {
		addedText: [],
		removedText: [],
		addedElements: [],
		removedElements: [],
	};

	function truncate(input: string | null, max: number): string | null {
		if (!input) return null;
		const trimmed = input.trim();
		return trimmed.length > max ? `${trimmed.substring(0, max)}...` : trimmed;
	}

	function getVisibleText(
		node: {
			nodeType: number;
			textContent?: string | null;
			tagName?: string;
			id?: string;
			innerText?: string;
		},
		isHidden = false,
	): string {
		if (node.nodeType === 3) return (node.textContent || "").trim();
		if (node.nodeType !== 1) return "";
		if (node.tagName && SKIP_TAGS[node.tagName]) return "";
		if (node.id === "__kovar-toolbar") return "";
		if (isHidden) return "";
		return truncate(node.innerText || node.textContent || "", 80) || "";
	}

	function nodeToSummary(node: {
		nodeType: number;
		tagName?: string;
		id?: string;
		innerText?: string;
		textContent?: string | null;
		getAttribute?: (name: string) => string | null;
	}) {
		if (node.nodeType !== 1) return null;
		if (node.tagName && (SKIP_TAGS[node.tagName] || node.id === "__kovar-toolbar")) return null;
		return {
			tagName: (node.tagName || "").toLowerCase(),
			role: node.getAttribute ? node.getAttribute("role") : null,
			text: truncate(node.innerText || node.textContent || "", 60),
		};
	}

	function processMutation(
		added: Array<{
			nodeType: number;
			tagName?: string;
			id?: string;
			textContent?: string | null;
			innerText?: string;
			getAttribute?: (name: string) => string | null;
		}>,
		removed: Array<{
			nodeType: number;
			tagName?: string;
			id?: string;
			textContent?: string | null;
			innerText?: string;
			getAttribute?: (name: string) => string | null;
		}>,
		hiddenSet = new Set<unknown>(),
	) {
		for (const node of added) {
			const text = getVisibleText(node, hiddenSet.has(node));
			if (text && text.length > 2 && mutationBuffer.addedText.length < 10) {
				mutationBuffer.addedText.push(text);
			}
			const summary = nodeToSummary(node);
			if (summary && mutationBuffer.addedElements.length < 10) {
				mutationBuffer.addedElements.push(summary);
			}
		}
		for (const node of removed) {
			const rText = getVisibleText(node, hiddenSet.has(node));
			if (rText && rText.length > 2 && mutationBuffer.removedText.length < 10) {
				mutationBuffer.removedText.push(rText);
			}
			const rSummary = nodeToSummary(node);
			if (rSummary && mutationBuffer.removedElements.length < 10) {
				mutationBuffer.removedElements.push(rSummary);
			}
		}
	}

	function setCurrentUrl(url: string) {
		currentUrl = url;
	}

	function flushDelta(): DeltaResult | null {
		const urlChanged = currentUrl !== lastUrl;
		const delta: DeltaResult = {
			urlChanged,
			newUrl: urlChanged ? currentUrl.split("?")[0]! : null,
			addedText: mutationBuffer.addedText.slice(),
			removedText: mutationBuffer.removedText.slice(),
			addedElements: mutationBuffer.addedElements.slice(),
			removedElements: mutationBuffer.removedElements.slice(),
		};
		lastUrl = currentUrl;
		mutationBuffer = {
			addedText: [],
			removedText: [],
			addedElements: [],
			removedElements: [],
		};

		if (
			!delta.urlChanged &&
			delta.addedText.length === 0 &&
			delta.removedText.length === 0 &&
			delta.addedElements.length === 0 &&
			delta.removedElements.length === 0
		) {
			return null;
		}
		return delta;
	}

	return { flushDelta, processMutation, setCurrentUrl };
}

function makeTextNode(text: string) {
	return { nodeType: 3, textContent: text };
}

function makeElementNode(tagName: string, text: string, attrs: Record<string, string> = {}) {
	return {
		nodeType: 1,
		tagName: tagName.toUpperCase(),
		id: attrs.id || "",
		textContent: text,
		innerText: text,
		getAttribute: (name: string) => attrs[name] || null,
	};
}

describe("Delta Tracker (MutationObserver logic from ACTION_CAPTURE_SCRIPT)", () => {
	describe("flushDelta", () => {
		it("returns null when no mutations occurred", () => {
			const tracker = createDeltaTracker();
			expect(tracker.flushDelta()).toBeNull();
		});

		it("returns delta with addedText when new text nodes appear", () => {
			const tracker = createDeltaTracker();
			tracker.processMutation([makeElementNode("div", "Hello world")], []);
			const delta = tracker.flushDelta();
			expect(delta).not.toBeNull();
			expect(delta!.addedText).toContain("Hello world");
		});

		it("returns delta with URL change when navigation happened", () => {
			const tracker = createDeltaTracker("https://example.com");
			tracker.setCurrentUrl("https://example.com/new-page?q=1");
			const delta = tracker.flushDelta();
			expect(delta).not.toBeNull();
			expect(delta!.urlChanged).toBe(true);
			expect(delta!.newUrl).toBe("https://example.com/new-page");
		});

		it("clears mutation buffer after flush (second call returns null)", () => {
			const tracker = createDeltaTracker();
			tracker.processMutation([makeElementNode("p", "Some text content")], []);
			const first = tracker.flushDelta();
			expect(first).not.toBeNull();

			const second = tracker.flushDelta();
			expect(second).toBeNull();
		});

		it("caps addedText at 10 items", () => {
			const tracker = createDeltaTracker();
			const nodes = Array.from({ length: 15 }, (_, i) =>
				makeElementNode("p", `Text item number ${i + 1}`),
			);
			tracker.processMutation(nodes, []);
			const delta = tracker.flushDelta();
			expect(delta!.addedText.length).toBe(10);
		});

		it("caps addedElements at 10 items", () => {
			const tracker = createDeltaTracker();
			const nodes = Array.from({ length: 15 }, (_, i) =>
				makeElementNode("div", `Element ${i + 1}`),
			);
			tracker.processMutation(nodes, []);
			const delta = tracker.flushDelta();
			expect(delta!.addedElements.length).toBe(10);
		});
	});

	describe("element filtering", () => {
		it("skips SCRIPT, STYLE, NOSCRIPT elements", () => {
			const tracker = createDeltaTracker();
			tracker.processMutation(
				[
					makeElementNode("script", "var x = 1;"),
					makeElementNode("style", ".a { color: red; }"),
					makeElementNode("noscript", "Enable JS"),
				],
				[],
			);
			const delta = tracker.flushDelta();
			expect(delta).toBeNull();
		});

		it("skips hidden/display:none elements", () => {
			const tracker = createDeltaTracker();
			const hiddenNode = makeElementNode("div", "Hidden text");
			tracker.processMutation([hiddenNode], [], new Set([hiddenNode]));
			const delta = tracker.flushDelta();
			// addedText should be empty since the node was hidden, but addedElements may still have it
			// because nodeToSummary doesn't check visibility — only getVisibleText does
			expect(delta?.addedText?.length ?? 0).toBe(0);
		});
	});

	describe("SPA navigation", () => {
		it("via pushState produces URL change in delta", () => {
			const tracker = createDeltaTracker("https://example.com");
			// Simulate pushState by changing URL
			tracker.setCurrentUrl("https://example.com/spa-page");
			const delta = tracker.flushDelta();
			expect(delta).not.toBeNull();
			expect(delta!.urlChanged).toBe(true);
			expect(delta!.newUrl).toBe("https://example.com/spa-page");
		});

		it("via replaceState produces URL change in delta", () => {
			const tracker = createDeltaTracker("https://example.com/old");
			// Simulate replaceState by changing URL
			tracker.setCurrentUrl("https://example.com/replaced");
			const delta = tracker.flushDelta();
			expect(delta).not.toBeNull();
			expect(delta!.urlChanged).toBe(true);
			expect(delta!.newUrl).toBe("https://example.com/replaced");
		});
	});
});
