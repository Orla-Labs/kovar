import { describe, expect, it } from "vitest";
import { generateLocator } from "../../../src/recorder/locator-generator.js";
import type { CapturedElement } from "../../../src/recorder/types.js";
import type { SourceMetadata } from "../../../src/source/types.js";

function makeElement(overrides: Partial<CapturedElement> = {}): CapturedElement {
	return {
		tagName: "button",
		role: null,
		ariaLabel: null,
		text: null,
		placeholder: null,
		testId: null,
		name: null,
		id: null,
		type: null,
		href: null,
		cssSelector: "button.primary",
		parentText: null,
		boundingRect: { x: 0, y: 0, width: 100, height: 40 },
		...overrides,
	};
}

describe("generateLocator", () => {
	it("returns a LocatorStrategy with primary, fallbacks, confidence, concerns", () => {
		const strategy = generateLocator(makeElement({ role: "button", ariaLabel: "Submit" }));
		expect(strategy).toHaveProperty("primary");
		expect(strategy).toHaveProperty("fallbacks");
		expect(strategy).toHaveProperty("confidence");
		expect(strategy).toHaveProperty("concerns");
		expect(Array.isArray(strategy.fallbacks)).toBe(true);
		expect(Array.isArray(strategy.concerns)).toBe(true);
	});

	it("generates getByRole when role + ariaLabel present", () => {
		const strategy = generateLocator(makeElement({ role: "button", ariaLabel: "Submit" }));
		expect(strategy.primary).toBe("page.getByRole('button', { name: 'Submit' })");
	});

	it("generates getByRole when role + short text present", () => {
		const strategy = generateLocator(makeElement({ role: "link", text: "Click here" }));
		expect(strategy.primary).toBe("page.getByRole('link', { name: 'Click here' })");
	});

	it("generates getByTestId when data-testid present", () => {
		const strategy = generateLocator(makeElement({ testId: "submit-btn" }));
		expect(strategy.primary).toBe("page.getByTestId('submit-btn')");
		expect(strategy.confidence).toBe(0.95);
	});

	it("generates getByPlaceholder when placeholder present", () => {
		const strategy = generateLocator(makeElement({ placeholder: "Search..." }));
		expect(strategy.primary).toBe("page.getByPlaceholder('Search...')");
	});

	it("generates getByText for short unique text", () => {
		const strategy = generateLocator(makeElement({ text: "Sign up" }));
		expect(strategy.primary).toBe("page.getByText('Sign up')");
		expect(strategy.confidence).toBe(0.7);
	});

	it("generates locator('#id') for non-auto-generated IDs", () => {
		const strategy = generateLocator(makeElement({ id: "main-nav" }));
		expect(strategy.primary).toBe("page.locator('#main-nav')");
	});

	it("skips auto-generated IDs (react-, ember, UUID-like, radix-)", () => {
		const reactId = generateLocator(
			makeElement({ id: "react-select-1", cssSelector: "div.select" }),
		);
		expect(reactId.primary).not.toContain("#react-select-1");
		expect(reactId.primary).toBe("page.locator('div.select')");

		const emberId = generateLocator(makeElement({ id: "ember123", cssSelector: "div.ember" }));
		expect(emberId.primary).not.toContain("#ember123");
		expect(emberId.primary).toBe("page.locator('div.ember')");

		const uuidId = generateLocator(
			makeElement({ id: "a1b2c3d4e5f6a7b8", cssSelector: "div.uuid" }),
		);
		expect(uuidId.primary).not.toContain("#a1b2c3d4e5f6a7b8");
		expect(uuidId.primary).toBe("page.locator('div.uuid')");

		const radixId = generateLocator(
			makeElement({ id: "radix-dropdown-1", cssSelector: "div.radix" }),
		);
		expect(radixId.primary).not.toContain("#radix-dropdown-1");
		expect(radixId.primary).toBe("page.locator('div.radix')");
	});

	it("generates locator('[name=\"...\"]') when name present", () => {
		const strategy = generateLocator(makeElement({ name: "email" }));
		expect(strategy.primary).toBe(`page.locator('[name="email"]')`);
	});

	it("falls back to CSS selector", () => {
		const strategy = generateLocator(makeElement({ cssSelector: "div.container > span.label" }));
		expect(strategy.primary).toBe("page.locator('div.container > span.label')");
		expect(strategy.confidence).toBe(0.4);
		expect(strategy.concerns).toContain("Using CSS fallback; consider adding data-testid");
	});

	it("escapes single quotes in text values", () => {
		const strategy = generateLocator(makeElement({ role: "button", ariaLabel: "it's a test" }));
		expect(strategy.primary).toBe("page.getByRole('button', { name: 'it\\'s a test' })");
	});

	it("prefers role over testId (priority order)", () => {
		const strategy = generateLocator(
			makeElement({ role: "button", ariaLabel: "Submit", testId: "submit-btn" }),
		);
		expect(strategy.primary).toContain("getByRole");
		expect(strategy.primary).not.toContain("getByTestId");
	});

	it("prefers testId over placeholder (priority order)", () => {
		const strategy = generateLocator(
			makeElement({ testId: "search-input", placeholder: "Search..." }),
		);
		expect(strategy.primary).toContain("getByTestId");
		expect(strategy.primary).not.toContain("getByPlaceholder");
	});

	it("does not use getByRole with text when text is too long", () => {
		const longText = "A".repeat(60);
		const strategy = generateLocator(
			makeElement({ role: "button", text: longText, cssSelector: "button.long" }),
		);
		// text length >= 50, so role+text branch should be skipped
		expect(strategy.primary).not.toContain("getByRole");
		expect(strategy.primary).toBe("page.locator('button.long')");
	});

	it("does not use getByText when text is too long", () => {
		const longText = "A".repeat(35);
		const strategy = generateLocator(makeElement({ text: longText, cssSelector: "span.long" }));
		// text length >= 30, so getByText branch should be skipped
		expect(strategy.primary).not.toContain("getByText");
		expect(strategy.primary).toBe("page.locator('span.long')");
	});

	it("does not use getByText when text contains newlines", () => {
		const strategy = generateLocator(makeElement({ text: "Line1\nLine2", cssSelector: "p.multi" }));
		expect(strategy.primary).not.toContain("getByText");
		expect(strategy.primary).toBe("page.locator('p.multi')");
	});

	it("adds parent context fallbacks when role + ariaLabel and parentTestId", () => {
		const strategy = generateLocator(
			makeElement({ role: "button", ariaLabel: "Save", parentTestId: "form-container" }),
		);
		expect(strategy.primary).toBe("page.getByRole('button', { name: 'Save' })");
		expect(strategy.fallbacks).toContainEqual(
			"page.getByTestId('form-container').getByRole('button', { name: 'Save' })",
		);
	});

	it("reduces confidence for dynamic content", () => {
		const strategy = generateLocator(
			makeElement({ role: "button", ariaLabel: "Submit", mightBeDynamic: true }),
		);
		expect(strategy.confidence).toBeLessThan(0.9);
		expect(strategy.concerns).toContainEqual("Contains dynamic content; using stable text portion");
	});

	it("uses stableText when mightBeDynamic is true", () => {
		const strategy = generateLocator(
			makeElement({
				role: "button",
				text: "51 Needs Review",
				stableText: "Needs Review",
				mightBeDynamic: true,
			}),
		);
		expect(strategy.primary).toContain("Needs Review");
		expect(strategy.primary).not.toContain("51");
	});

	it("reduces confidence for elements with many siblings", () => {
		const strategy = generateLocator(
			makeElement({ role: "button", ariaLabel: "Delete", siblingCount: 5 }),
		);
		expect(strategy.confidence).toBeLessThan(0.9);
	});

	it("adds nth fallback for non-first siblings with low confidence", () => {
		const strategy = generateLocator(
			makeElement({ text: "Sign up", siblingIndex: 2, siblingCount: 3 }),
		);
		// confidence is 0.7 for getByText, and siblingCount > 1 reduces it further
		expect(strategy.fallbacks.some((f) => f.includes(".nth(2)"))).toBe(true);
	});

	it("returns source-derived testId with 0.97 confidence when sourceMetadata has testId", () => {
		const sourceMeta: SourceMetadata = {
			componentName: "LoginForm",
			filePath: "src/components/LoginForm.tsx",
			line: 42,
			column: 8,
			elementTag: "button",
			testId: "login-submit",
			ariaLabel: null,
			role: null,
			eventHandlers: ["handleSubmit"],
			className: "btn-primary",
		};
		const strategy = generateLocator(
			makeElement({ role: "button", ariaLabel: "Log in" }),
			sourceMeta,
		);
		expect(strategy.primary).toBe("page.getByTestId('login-submit')");
		expect(strategy.confidence).toBe(0.97);
		expect(strategy.concerns).toContainEqual(
			"Source-verified from src/components/LoginForm.tsx:42",
		);
	});

	it("returns source-derived role+ariaLabel with 0.95 confidence", () => {
		const sourceMeta: SourceMetadata = {
			componentName: "NavBar",
			filePath: "src/components/NavBar.tsx",
			line: 15,
			column: 4,
			elementTag: "button",
			testId: null,
			ariaLabel: "Open menu",
			role: "button",
			eventHandlers: ["toggleMenu"],
			className: null,
		};
		const strategy = generateLocator(makeElement({}), sourceMeta);
		expect(strategy.primary).toBe("page.getByRole('button', { name: 'Open menu' })");
		expect(strategy.confidence).toBe(0.95);
		expect(strategy.concerns).toContainEqual("Source-verified from src/components/NavBar.tsx:15");
	});

	it("falls back to DOM-based selectors when no sourceMetadata", () => {
		const strategy = generateLocator(makeElement({ role: "button", ariaLabel: "Save" }));
		expect(strategy.primary).toBe("page.getByRole('button', { name: 'Save' })");
		expect(strategy.confidence).toBe(0.9);
		expect(strategy.concerns).not.toContainEqual(expect.stringContaining("Source-verified"));
	});

	// ── Shadow DOM Tests ──

	describe("shadow DOM support", () => {
		it("generates chained locator through shadow host", () => {
			const strategy = generateLocator(
				makeElement({
					role: "button",
					ariaLabel: "Submit",
					shadowHost: { tag: "custom-form" },
					shadowDepth: 1,
				}),
			);
			expect(strategy.primary).toBe(
				"page.locator('custom-form').getByRole('button', { name: 'Submit' })",
			);
		});

		it("uses testId as primary selector for shadow host", () => {
			const strategy = generateLocator(
				makeElement({
					role: "button",
					ariaLabel: "Save",
					shadowHost: { tag: "my-component", testId: "my-widget" },
					shadowDepth: 1,
				}),
			);
			expect(strategy.primary).toBe(
				`page.locator('[data-testid="my-widget"]').getByRole('button', { name: 'Save' })`,
			);
		});

		it("uses shadow host id when available", () => {
			const strategy = generateLocator(
				makeElement({
					testId: "inner-btn",
					shadowHost: { tag: "x-panel", id: "main-panel" },
					shadowDepth: 1,
				}),
			);
			expect(strategy.primary).toBe("page.locator('#main-panel').getByTestId('inner-btn')");
		});

		it("handles nested shadow DOM (depth 2+) with correct chain", () => {
			const strategy = generateLocator(
				makeElement({
					role: "link",
					ariaLabel: "Help",
					shadowHost: { tag: "inner-widget" },
					shadowDepth: 2,
				}),
			);
			expect(strategy.primary).toBe(
				"page.locator('inner-widget').getByRole('link', { name: 'Help' })",
			);
			expect(strategy.concerns).toContainEqual("Element is inside shadow DOM (depth 2)");
		});

		it("reduces confidence for shadow DOM locators", () => {
			const lightDom = generateLocator(makeElement({ role: "button", ariaLabel: "Click" }));
			const shadowDom = generateLocator(
				makeElement({
					role: "button",
					ariaLabel: "Click",
					shadowHost: { tag: "x-button" },
					shadowDepth: 1,
				}),
			);
			expect(shadowDom.confidence).toBeLessThan(lightDom.confidence);
		});
	});

	// ── Iframe Tests ──

	describe("iframe support", () => {
		it("generates frameLocator with iframe name", () => {
			const strategy = generateLocator(
				makeElement({
					role: "textbox",
					ariaLabel: "Card number",
					frameName: "payment-frame",
					frameSelector: 'iframe[name="payment-frame"]',
				}),
			);
			expect(strategy.primary).toBe(
				`page.frameLocator('iframe[name="payment-frame"]').getByRole('textbox', { name: 'Card number' })`,
			);
		});

		it("generates frameLocator with CSS selector when no name", () => {
			const strategy = generateLocator(
				makeElement({
					testId: "email-input",
					frameSelector: "#embed-iframe",
				}),
			);
			expect(strategy.primary).toBe(
				"page.frameLocator('#embed-iframe').getByTestId('email-input')",
			);
		});

		it("generates frameLocator with src pattern from frameUrl", () => {
			const strategy = generateLocator(
				makeElement({
					role: "button",
					ariaLabel: "Pay",
					frameUrl: "https://pay.stripe.com/checkout",
				}),
			);
			expect(strategy.primary).toBe(
				`page.frameLocator('iframe[src*="/checkout"]').getByRole('button', { name: 'Pay' })`,
			);
		});

		it("reduces confidence for iframe locators", () => {
			const topFrame = generateLocator(makeElement({ role: "button", ariaLabel: "Click" }));
			const inIframe = generateLocator(
				makeElement({
					role: "button",
					ariaLabel: "Click",
					frameName: "child",
					frameSelector: 'iframe[name="child"]',
				}),
			);
			expect(inIframe.confidence).toBeLessThan(topFrame.confidence);
		});

		it("includes iframe concern in concerns array", () => {
			const strategy = generateLocator(
				makeElement({
					role: "button",
					ariaLabel: "Submit",
					frameName: "checkout",
					frameSelector: 'iframe[name="checkout"]',
				}),
			);
			expect(strategy.concerns).toContainEqual('Element is inside an iframe (name="checkout")');
		});
	});
});
