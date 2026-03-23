import { describe, expect, it } from "vitest";
import { buildFixPrompt, buildPrompt } from "../../../src/recorder/llm/prompt.js";
import type { RecordedAction, RecordedRequest, SessionData } from "../../../src/recorder/types.js";

const mockSession: SessionData = {
	startUrl: "https://example.com/login",
	finalUrl: "https://example.com/dashboard",
	pageTitle: "Dashboard",
	actions: [
		{
			type: "navigation",
			timestamp: 1000,
			url: "https://example.com/login",
			element: null,
		} satisfies RecordedAction,
		{
			type: "click",
			timestamp: 2000,
			url: "https://example.com/login",
			element: {
				tagName: "button",
				role: "button",
				ariaLabel: "Sign In",
				text: "Sign In",
				placeholder: null,
				testId: null,
				name: null,
				id: "sign-in-btn",
				type: "submit",
				href: null,
				cssSelector: "button#sign-in-btn",
				parentText: null,
				boundingRect: { x: 200, y: 300, width: 100, height: 40 },
			},
		} satisfies RecordedAction,
	],
	requests: [
		{
			timestamp: 3000,
			method: "POST",
			url: "https://example.com/api/login",
			resourceType: "fetch",
			requestHeaders: { "content-type": "application/json" },
			requestPostData: '{"email":"test@example.com"}',
			responseStatus: 200,
			responseHeaders: { "content-type": "application/json" },
			responseBody: '{"token":"abc123"}',
			duration: 120,
		} satisfies RecordedRequest,
	],
	assertions: [],
	startTime: 0,
	endTime: 5000,
};

describe("buildPrompt — snapshot and structural checks", () => {
	it("returns an object with system and user strings", () => {
		const result = buildPrompt(mockSession, "login-flow");
		expect(result).toHaveProperty("system");
		expect(result).toHaveProperty("user");
		expect(typeof result.system).toBe("string");
		expect(typeof result.user).toBe("string");
	});

	it("system prompt contains key structural markers", () => {
		const { system } = buildPrompt(mockSession, "login-flow");
		expect(system).toContain("Security Notice");
		expect(system).toContain("Output Format");
		expect(system).toContain("Page Object Rules");
		expect(system).toContain("Anti-Patterns");
	});

	it("user prompt contains session URL and action/API sections", () => {
		const { user } = buildPrompt(mockSession, "login-flow");
		expect(user).toContain("https://example.com/login");
		expect(user).toContain("[click]");
		expect(user).toContain("POST https://example.com/api/login");
	});

	it("system prompt does NOT contain session-specific data", () => {
		const { system } = buildPrompt(mockSession, "login-flow");
		expect(system).not.toContain("example.com/login");
		expect(system).not.toContain("example.com/dashboard");
		// "Sign In" appears in the system prompt's example output, so we check
		// that session-specific URLs and the page title are absent instead
		expect(system).not.toContain("sign-in-btn");
		expect(system).not.toContain("api/login");
		expect(system).not.toContain("login-flow");
	});

	it("user prompt contains BEGIN/END RECORDED ACTIONS delimiters", () => {
		const { user } = buildPrompt(mockSession, "login-flow");
		expect(user).toContain("--- BEGIN RECORDED ACTIONS");
		expect(user).toContain("--- END RECORDED ACTIONS ---");
	});

	it("user prompt contains BEGIN/END ASSERTION SUGGESTIONS delimiters", () => {
		const { user } = buildPrompt(mockSession, "login-flow");
		expect(user).toContain("--- BEGIN ASSERTION SUGGESTIONS");
		expect(user).toContain("--- END ASSERTION SUGGESTIONS ---");
	});

	it("system prompt matches snapshot to catch regressions", () => {
		const { system } = buildPrompt(mockSession, "login-flow");
		expect(system).toMatchSnapshot();
	});
});

describe("buildFixPrompt — snapshot and structural checks", () => {
	const specCode = `import { test, expect } from '@playwright/test';
test('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign In' }).click();
});`;

	const pageCode = `import type { Page } from '@playwright/test';
export class LoginPage {
  constructor(private page: Page) {}
  get signInButton() { return this.page.getByRole('button', { name: 'Sign In' }); }
}`;

	const errorOutput = "Error: locator.click: Timeout 30000ms exceeded.";

	it("returns an object with system and user strings", () => {
		const result = buildFixPrompt(specCode, pageCode, errorOutput);
		expect(result).toHaveProperty("system");
		expect(result).toHaveProperty("user");
		expect(typeof result.system).toBe("string");
		expect(typeof result.user).toBe("string");
	});

	it("system prompt contains Playwright test debugger reference", () => {
		const { system } = buildFixPrompt(specCode, pageCode, errorOutput);
		expect(system).toContain("Playwright test debugger");
	});

	it("user prompt contains spec code, page code, and error output", () => {
		const { user } = buildFixPrompt(specCode, pageCode, errorOutput);
		expect(user).toContain("page.goto('/login')");
		expect(user).toContain("LoginPage");
		expect(user).toContain("Timeout 30000ms exceeded");
	});

	it("truncates error output longer than 3000 characters", () => {
		const longError = "X".repeat(4000);
		const { user } = buildFixPrompt(specCode, pageCode, longError);

		const errorSectionStart = user.indexOf("### Error Output");
		const errorSection = user.slice(errorSectionStart);
		const xCount = (errorSection.match(/X/g) ?? []).length;

		expect(xCount).toBeLessThanOrEqual(3000);
		expect(xCount).toBeGreaterThan(0);
	});
});
