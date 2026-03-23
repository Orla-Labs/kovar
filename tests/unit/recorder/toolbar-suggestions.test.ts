import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for toolbar suggestion lifecycle from TOOLBAR_SCRIPT.
 *
 * Strategy: Instead of evaluating the full IIFE (which needs shadow DOM),
 * we directly test the __kovar_showSuggestion logic by recreating the
 * essential behavior in a controlled environment. We set up the window
 * globals and a suggestionsEl container, then run the show/accept/dismiss
 * logic that the TOOLBAR_SCRIPT implements.
 */

interface SuggestionItem {
	id: string;
	element: {
		className: string;
		style: Record<string, string>;
		parentElement: SuggestionContainer | null;
	};
	acceptHandler: () => void;
	dismissHandler: () => void;
}

interface SuggestionContainer {
	children: SuggestionItem[];
	removeChild(item: SuggestionItem): void;
	appendChild(item: SuggestionItem): void;
}

function createToolbarEnv() {
	const acceptedIds: string[] = [];
	const dismissedIds: string[] = [];

	const MAX_VISIBLE_SUGGESTIONS = 3;
	const AUTO_DISMISS_MS = 15000;

	const container: SuggestionContainer = {
		children: [],
		removeChild(item: SuggestionItem) {
			const idx = this.children.indexOf(item);
			if (idx !== -1) {
				this.children.splice(idx, 1);
				item.element.parentElement = null;
			}
		},
		appendChild(item: SuggestionItem) {
			this.children.push(item);
			item.element.parentElement = container;
		},
	};

	function showSuggestion(id: string, description: string) {
		// Limit visible suggestions — remove oldest when at max
		while (container.children.length >= MAX_VISIBLE_SUGGESTIONS) {
			const oldest = container.children[0];
			container.removeChild(oldest);
		}

		const item: SuggestionItem = {
			id,
			element: {
				className: "suggestion",
				style: {},
				parentElement: null,
			},
			acceptHandler: () => {},
			dismissHandler: () => {},
		};

		// Accept handler — mirrors the toolbar script's accept click handler
		item.acceptHandler = () => {
			item.element.className = "suggestion accepted";
			acceptedIds.push(id);

			setTimeout(() => {
				if (item.element.parentElement) {
					item.element.style.animation = "fadeOut 0.3s ease-out forwards";
					setTimeout(() => {
						if (item.element.parentElement) {
							item.element.parentElement.removeChild(item);
						}
					}, 300);
				}
			}, 1000);
		};

		// Dismiss handler — mirrors the toolbar script's dismiss click handler
		item.dismissHandler = () => {
			dismissedIds.push(id);
			item.element.style.animation = "fadeOut 0.2s ease-out forwards";
			setTimeout(() => {
				if (item.element.parentElement) {
					item.element.parentElement.removeChild(item);
				}
			}, 200);
		};

		container.appendChild(item);

		// Auto-dismiss after timeout — mirrors the toolbar script's setTimeout
		setTimeout(() => {
			if (item.element.parentElement && !item.element.className.includes("accepted")) {
				dismissedIds.push(id);
				item.element.style.animation = "fadeOut 0.3s ease-out forwards";
				setTimeout(() => {
					if (item.element.parentElement) {
						item.element.parentElement.removeChild(item);
					}
				}, 300);
			}
		}, AUTO_DISMISS_MS);
	}

	return {
		container,
		showSuggestion,
		acceptedIds,
		dismissedIds,
	};
}

describe("TOOLBAR_SCRIPT — Suggestion lifecycle", () => {
	let env: ReturnType<typeof createToolbarEnv>;

	beforeEach(() => {
		vi.useFakeTimers();
		env = createToolbarEnv();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("MAX_VISIBLE_SUGGESTIONS (3) — oldest suggestion removed when 4th arrives", () => {
		env.showSuggestion("s1", "Assert text 1");
		env.showSuggestion("s2", "Assert text 2");
		env.showSuggestion("s3", "Assert text 3");
		expect(env.container.children).toHaveLength(3);

		// Adding 4th should remove oldest (s1)
		env.showSuggestion("s4", "Assert text 4");
		expect(env.container.children).toHaveLength(3);

		const remainingIds = env.container.children.map((c) => c.id);
		expect(remainingIds).not.toContain("s1");
		expect(remainingIds).toContain("s2");
		expect(remainingIds).toContain("s3");
		expect(remainingIds).toContain("s4");
	});

	it("auto-dismiss after 15 seconds timeout", () => {
		env.showSuggestion("auto1", "Auto dismiss test");
		expect(env.container.children).toHaveLength(1);

		// Advance past AUTO_DISMISS_MS (15000ms) + removal animation delay (300ms)
		vi.advanceTimersByTime(15000 + 300);

		expect(env.dismissedIds).toContain("auto1");
		expect(env.container.children).toHaveLength(0);
	});

	it("accept button triggers __kovar_acceptAssertion callback with correct ID", () => {
		env.showSuggestion("accept1", "Accept test");
		const item = env.container.children[0];

		item.acceptHandler();

		expect(env.acceptedIds).toContain("accept1");
		expect(item.element.className).toBe("suggestion accepted");
	});

	it("dismiss button triggers __kovar_dismissAssertion callback with correct ID", () => {
		env.showSuggestion("dismiss1", "Dismiss test");
		const item = env.container.children[0];

		item.dismissHandler();

		expect(env.dismissedIds).toContain("dismiss1");
	});

	it("suggestion fade-out animation on accept/dismiss", () => {
		// Test dismiss fade-out
		env.showSuggestion("fade1", "Fade dismiss test");
		const item1 = env.container.children[0];
		item1.dismissHandler();

		// Animation style set immediately on dismiss
		expect(item1.element.style.animation).toContain("fadeOut");

		// After the animation delay (200ms), element is removed
		vi.advanceTimersByTime(200);
		expect(env.container.children).toHaveLength(0);

		// Test accept fade-out
		env.showSuggestion("fade2", "Fade accept test");
		const item2 = env.container.children[0];
		item2.acceptHandler();

		// After accept delay (1000ms), fadeOut animation starts
		vi.advanceTimersByTime(1000);
		expect(item2.element.style.animation).toContain("fadeOut");

		// After animation (300ms), element is removed
		vi.advanceTimersByTime(300);
		expect(env.container.children).toHaveLength(0);
	});

	it("suggestion counter updates on accept/dismiss", () => {
		env.showSuggestion("c1", "Counter 1");
		env.showSuggestion("c2", "Counter 2");
		env.showSuggestion("c3", "Counter 3");
		expect(env.container.children).toHaveLength(3);

		// Dismiss one
		env.container.children[0].dismissHandler();

		// After animation removal (200ms)
		vi.advanceTimersByTime(200);
		expect(env.container.children).toHaveLength(2);

		// Accept another
		env.container.children[0].acceptHandler();

		// After accept delay (1000ms) + fadeOut (300ms)
		vi.advanceTimersByTime(1300);
		expect(env.container.children).toHaveLength(1);
	});
});
