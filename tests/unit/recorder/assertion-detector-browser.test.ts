import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for browser-side assertion detection from ASSERTION_DETECTOR_SCRIPT.
 *
 * The Node-side AssertionDetector tests are in assertion-detector.test.ts.
 * This file tests the BROWSER script logic: URL change detection, title change,
 * dialog detection, toast/snackbar detection, heading detection, etc.
 */

interface Suggestion {
	id: string;
	type: string;
	description: string;
	playwrightCode: string;
	timestamp: number;
	accepted: boolean;
	afterActionIndex: number;
}

/**
 * Creates a testable browser-side assertion detector environment
 * replicating ASSERTION_DETECTOR_SCRIPT logic.
 */
function createAssertionDetectorEnv(options: { initialUrl?: string; initialTitle?: string } = {}) {
	const MAX_SUGGESTIONS = 50;
	let suggestionCount = 0;
	let lastUrl = options.initialUrl ?? "https://example.com";
	let lastTitle = options.initialTitle ?? "Test Page";
	let lastSuggestedUrl = lastUrl;
	let lastSuggestedTitle = lastTitle;
	const seenTexts = new Set<string>();
	let idCounter = 0;
	const suggestions: Suggestion[] = [];

	// Simulate current browser state
	let currentUrl = lastUrl;
	let currentTitle = lastTitle;

	function genId() {
		return `a_${++idCounter}_${Date.now()}`;
	}

	function suggest(type: string, description: string, playwrightCode: string) {
		if (suggestionCount >= MAX_SUGGESTIONS) return;
		suggestionCount++;
		const suggestion: Suggestion = {
			id: genId(),
			type,
			description,
			playwrightCode,
			timestamp: Date.now(),
			accepted: false,
			afterActionIndex: 0,
		};
		suggestions.push(suggestion);
	}

	function checkUrl() {
		if (currentUrl !== lastUrl) {
			lastUrl = currentUrl;
			if (currentUrl !== lastSuggestedUrl) {
				lastSuggestedUrl = currentUrl;
				try {
					const parsed = new URL(currentUrl);
					const path = parsed.pathname;
					const safePath = path.replace(/\//g, "\\/").replace(/^\\\//, "");
					suggest(
						"url",
						`Assert navigation to ${path}`,
						`await expect(page).toHaveURL(/${safePath}/)`,
					);
				} catch {
					// ignore
				}
			}
		}
	}

	function checkTitle() {
		if (currentTitle !== lastTitle && currentTitle.length > 0) {
			lastTitle = currentTitle;
			if (currentTitle !== lastSuggestedTitle) {
				lastSuggestedTitle = currentTitle;
				const safeTitle = currentTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").substring(0, 40);
				suggest(
					"title",
					`Assert page title is "${currentTitle.substring(0, 50)}"`,
					`await expect(page).toHaveTitle(/${safeTitle}/)`,
				);
			}
		}
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: test helper mirrors browser-side mutation processing logic
	function processMutationAdded(
		nodes: Array<{
			nodeType: number;
			tagName?: string;
			id?: string;
			innerText?: string;
			className?: string;
			getAttribute?: (name: string) => string | null;
			closest?: (selector: string) => unknown | null;
		}>,
	) {
		for (const node of nodes) {
			if (node.nodeType !== 1) continue;
			const tag = node.tagName ?? "";
			const id = node.id ?? "";

			// Skip toolbar and script/style
			if (id === "__kovar-toolbar") continue;
			if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;

			// Check for data-kovar attributes (toolbar elements)
			const hasKovarAttr = node.getAttribute && node.getAttribute("data-kovar") !== null;
			if (hasKovarAttr) continue;

			const text = (node.innerText || "").trim();
			const role = node.getAttribute ? node.getAttribute("role") : null;
			const className = node.className || "";

			// Dialog/modal detection
			if (role === "dialog" || role === "alertdialog") {
				const dialogTitle = text.length > 60 ? `${text.substring(0, 57)}...` : text;
				suggest(
					"element_visible",
					`Assert dialog "${dialogTitle || "dialog"}" is visible`,
					"await expect(page.getByRole('dialog')).toBeVisible()",
				);
				continue;
			}

			// Toast/snackbar/notification detection
			if (/toast|snackbar|notification/i.test(className) || role === "status") {
				if (text.length >= 4 && text.length <= 200 && !seenTexts.has(text)) {
					seenTexts.add(text);
					const toastText = text.length > 40 ? text.substring(0, 40) : text;
					const safeToast = toastText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					suggest(
						"text_visible",
						`Assert notification "${toastText}" is visible`,
						`await expect(page.getByText(/${safeToast}/)).toBeVisible()`,
					);
				}
				continue;
			}

			if (text.length < 4 || text.length > 200) continue;
			if (seenTexts.has(text)) continue;
			seenTexts.add(text);
			if (text.split("\n").length > 5) continue;

			// Headings, alerts, status messages
			const isHeading = /^H[1-3]$/.test(tag);
			const isAlert = role === "alert";
			const isMessage =
				/success|error|warning|welcome|logged|saved|created|deleted|updated|failed|invalid/i.test(
					text,
				);

			const isFormError =
				(role === "alert" && node.closest && node.closest("form")) ||
				/error|invalid|validation/i.test(className);

			if (isHeading || isAlert || isMessage || isFormError) {
				const shortText = text.length > 60 ? `${text.substring(0, 57)}...` : text;
				const matchText = text.length > 40 ? text.substring(0, 40) : text;
				const escaped = matchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				suggest(
					"text_visible",
					`Assert "${shortText}" is visible`,
					`await expect(page.getByText(/${escaped}/)).toBeVisible()`,
				);
			}
		}
	}

	function processMutationRemoved(
		nodes: Array<{
			nodeType: number;
			tagName?: string;
			id?: string;
			className?: string;
			getAttribute?: (name: string) => string | null;
		}>,
	) {
		for (const node of nodes) {
			if (node.nodeType !== 1) continue;
			if (node.id === "__kovar-toolbar") continue;
			const rClass = node.className || "";
			const rRole = node.getAttribute ? node.getAttribute("role") : null;
			if (rRole === "progressbar" || /loading|spinner|skeleton/i.test(rClass)) {
				suggest(
					"element_hidden",
					"Assert loading indicator is gone",
					"await expect(page.locator('[role=\"progressbar\"]')).toBeHidden()",
				);
			}
		}
	}

	return {
		get suggestions() {
			return suggestions;
		},
		get suggestionCount() {
			return suggestionCount;
		},
		setUrl(url: string) {
			currentUrl = url;
		},
		setTitle(title: string) {
			currentTitle = title;
		},
		checkUrl,
		checkTitle,
		processMutationAdded,
		processMutationRemoved,
		seenTexts,
	};
}

function makeNode(tag: string, text: string, attrs: Record<string, string> = {}, className = "") {
	return {
		nodeType: 1 as const,
		tagName: tag.toUpperCase(),
		id: attrs.id || "",
		innerText: text,
		className,
		getAttribute: (name: string) => attrs[name] ?? null,
		closest: (_selector: string) => null,
	};
}

describe("Assertion Detector Browser Script", () => {
	describe("URL change detection", () => {
		it("produces suggestion when URL changes", () => {
			const env = createAssertionDetectorEnv({ initialUrl: "https://example.com/" });
			env.setUrl("https://example.com/dashboard");
			env.checkUrl();
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("url");
			expect(env.suggestions[0]?.description).toContain("/dashboard");
		});

		it("does NOT produce duplicate suggestion for same URL within consecutive checks", () => {
			const env = createAssertionDetectorEnv({ initialUrl: "https://example.com/" });
			env.setUrl("https://example.com/dashboard");
			env.checkUrl();
			// Call checkUrl again without changing URL — should not duplicate
			env.checkUrl();
			const urlSuggestions = env.suggestions.filter((s) => s.type === "url");
			expect(urlSuggestions).toHaveLength(1);
		});
	});

	describe("Title change detection", () => {
		it("produces suggestion when title changes", () => {
			const env = createAssertionDetectorEnv({ initialTitle: "Home" });
			env.setTitle("Dashboard - MyApp");
			env.checkTitle();
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("title");
			expect(env.suggestions[0]?.description).toContain("Dashboard - MyApp");
		});

		it("does NOT duplicate for same title within consecutive checks", () => {
			const env = createAssertionDetectorEnv({ initialTitle: "Home" });
			env.setTitle("Dashboard");
			env.checkTitle();
			// Call checkTitle again without changing title — lastTitle is already Dashboard
			env.checkTitle();
			const titleSuggestions = env.suggestions.filter((s) => s.type === "title");
			expect(titleSuggestions).toHaveLength(1);
		});
	});

	describe("Dialog/modal detection", () => {
		it('role="dialog" triggers suggestion', () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("div", "Confirm deletion?", { role: "dialog" })]);
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("element_visible");
			expect(env.suggestions[0]?.description).toContain("dialog");
		});

		it('role="alertdialog" triggers suggestion', () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("div", "Are you sure?", { role: "alertdialog" })]);
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("element_visible");
		});
	});

	describe("Toast/snackbar detection", () => {
		it('elements with class containing "toast" trigger suggestion', () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("div", "Item saved successfully", {}, "toast-container")]);
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("text_visible");
			expect(env.suggestions[0]?.description).toContain("notification");
		});

		it('elements with class containing "snackbar" trigger suggestion', () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("div", "Changes applied", {}, "snackbar")]);
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("text_visible");
		});

		it('elements with class containing "notification" trigger suggestion', () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([
				makeNode("div", "New message received", {}, "notification-banner"),
			]);
			expect(env.suggestions).toHaveLength(1);
		});
	});

	describe("Heading detection", () => {
		it("new visible h1 triggers suggestion", () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("h1", "Welcome to Dashboard")]);
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("text_visible");
			expect(env.suggestions[0]?.description).toContain("Welcome to Dashboard");
		});

		it("new visible h2 triggers suggestion", () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("h2", "User Settings")]);
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("text_visible");
		});
	});

	describe("Loading indicator removal", () => {
		it('element with "loading" class being removed triggers suggestion', () => {
			const env = createAssertionDetectorEnv();
			env.processMutationRemoved([makeNode("div", "", {}, "loading-indicator")]);
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("element_hidden");
			expect(env.suggestions[0]?.description).toContain("loading indicator");
		});

		it('element with "spinner" class being removed triggers suggestion', () => {
			const env = createAssertionDetectorEnv();
			env.processMutationRemoved([makeNode("div", "", {}, "spinner")]);
			expect(env.suggestions).toHaveLength(1);
			expect(env.suggestions[0]?.type).toBe("element_hidden");
		});
	});

	describe("Skip rules", () => {
		it("skips toolbar elements (id=__kovar-toolbar)", () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([
				makeNode("div", "Toolbar text content", { id: "__kovar-toolbar" }),
			]);
			expect(env.suggestions).toHaveLength(0);
		});

		it("skips SCRIPT tags", () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("script", 'console.log("hello")')]);
			expect(env.suggestions).toHaveLength(0);
		});

		it("skips STYLE tags", () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("style", ".a { color: red; }")]);
			expect(env.suggestions).toHaveLength(0);
		});
	});

	describe("Limits and deduplication", () => {
		it("respects MAX_SUGGESTIONS limit (50)", () => {
			const env = createAssertionDetectorEnv();
			for (let i = 0; i < 55; i++) {
				env.processMutationAdded([makeNode("h1", `Unique heading text number ${i}`)]);
			}
			expect(env.suggestions.length).toBe(50);
		});

		it("deduplicates via seenTexts Set", () => {
			const env = createAssertionDetectorEnv();
			env.processMutationAdded([makeNode("h1", "Welcome Back")]);
			env.processMutationAdded([makeNode("h2", "Welcome Back")]);
			// Only one suggestion since text is duplicate
			expect(env.suggestions).toHaveLength(1);
		});
	});
});
