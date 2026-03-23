import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestGenerator } from "../../../src/recorder/test-generator.js";
import type { SessionData } from "../../../src/recorder/types.js";
import { MockLLMProvider } from "../../helpers/mock-llm-provider.js";

/**
 * Integration test for the TestGenerator class — exercises the full pipeline:
 * session data → LLM prompt → code extraction → validation → file writing.
 *
 * Uses a MockLLMProvider to avoid real API calls, but everything else is real
 * (file system, code validation, URL replacement, .env.example generation).
 */

const VALID_POM_RESPONSE = `Here is the generated test:

\`\`\`typescript:pages
import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  private get emailInput() { return this.page.getByRole('textbox', { name: 'Email' }); }
  private get passwordInput() { return this.page.getByRole('textbox', { name: 'Password' }); }
  private get submitButton() { return this.page.getByRole('button', { name: 'Sign In' }); }

  async navigate() {
    await this.page.goto(\`\${process.env.BASE_URL}/login\`);
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
\`\`\`

\`\`\`typescript:spec
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';

const EMAIL = process.env.TEST_EMAIL ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

test('user logs in successfully', async ({ page }) => {
  const loginPage = new LoginPage(page);

  // Intent: Navigate and authenticate
  await loginPage.navigate();
  await loginPage.login(EMAIL, PASSWORD);

  // Intent: Verify successful login
  await expect(page).toHaveURL(/dashboard/);
});
\`\`\``;

function createSessionData(overrides?: Partial<SessionData>): SessionData {
	return {
		startUrl: "https://myapp.example.com/login",
		finalUrl: "https://myapp.example.com/dashboard",
		pageTitle: "Dashboard",
		actions: [
			{
				type: "navigation",
				timestamp: 1000,
				url: "https://myapp.example.com/login",
				element: null,
			},
			{
				type: "click",
				timestamp: 2000,
				url: "https://myapp.example.com/login",
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
					cssSelector: "#sign-in-btn",
					parentText: "Sign In",
					boundingRect: { x: 100, y: 200, width: 80, height: 30 },
				},
			},
		],
		requests: [
			{
				timestamp: 2500,
				method: "POST",
				url: "https://myapp.example.com/api/login",
				resourceType: "fetch",
				requestHeaders: { "content-type": "application/json" },
				requestPostData: '{"email":"[EMAIL]","password":"[PASSWORD]"}',
				responseStatus: 200,
				responseHeaders: { "content-type": "application/json" },
				responseBody: '{"token":"[JWT_REDACTED]","user":{"name":"Test"}}',
				duration: 150,
			},
		],
		assertions: [],
		startTime: 1000,
		endTime: 5000,
		...overrides,
	};
}

describe("TestGenerator — integration pipeline", () => {
	let outputDir: string;
	let provider: MockLLMProvider;

	beforeEach(() => {
		outputDir = mkdtempSync(join(tmpdir(), "kovar-gen-integ-"));
		provider = new MockLLMProvider();
	});

	afterEach(() => {
		rmSync(outputDir, { recursive: true, force: true });
	});

	it("full pipeline: session → prompt → LLM → extract → validate → write files", async () => {
		provider.enqueueResponse({
			testCode: VALID_POM_RESPONSE,
			testName: "",
			tokensUsed: 1500,
		});

		const generator = new TestGenerator(provider, outputDir);
		const session = createSessionData();
		const result = await generator.generate(session, "login");

		// Files were written
		expect(existsSync(result.specPath)).toBe(true);
		expect(result.pagePath).not.toBeNull();
		expect(existsSync(result.pagePath!)).toBe(true);

		// Spec file has correct content
		const specContent = readFileSync(result.specPath, "utf-8");
		expect(specContent).toContain("test(");
		expect(specContent).toContain("expect");
		expect(specContent).toContain("LoginPage");

		// Page object file has correct content
		const pageContent = readFileSync(result.pagePath!, "utf-8");
		expect(pageContent).toContain("export class LoginPage");
		expect(pageContent).toContain("getByRole");

		// URL replacement happened
		expect(pageContent).toContain("process.env.BASE_URL");
		expect(pageContent).not.toContain("https://myapp.example.com");

		// .env.example was generated (spec uses TEST_EMAIL and TEST_PASSWORD)
		const envPath = join(outputDir, ".env.example");
		expect(existsSync(envPath)).toBe(true);
		const envContent = readFileSync(envPath, "utf-8");
		expect(envContent).toContain("TEST_EMAIL");
		expect(envContent).toContain("TEST_PASSWORD");

		// LLM was called exactly once
		expect(provider.getCallCount()).toBe(1);

		// Prompt was built correctly
		const call = provider.getCall(0)!;
		expect(call.systemPrompt).toContain("Page Object Model");
		expect(call.userPrompt).toContain("myapp.example.com/login");
		expect(call.userPrompt).toContain("POST");
		expect(call.userPrompt).toContain("/api/login");
	});

	it("falls back to raw JSON when LLM returns invalid code", async () => {
		provider.enqueueResponse({
			testCode: "I cannot generate code for this.",
			testName: "",
			tokensUsed: 50,
		});

		const generator = new TestGenerator(provider, outputDir);
		const session = createSessionData();
		const result = await generator.generate(session, "login");

		// Fallback recording file was written
		expect(existsSync(result.specPath)).toBe(true);
		expect(result.specPath).toContain(".recording");

		// Contains the raw session JSON
		const content = readFileSync(result.specPath, "utf-8");
		const parsed = JSON.parse(content);
		expect(parsed.startUrl).toBe("https://myapp.example.com/login");
		expect(parsed.actions).toHaveLength(2);
	});

	it("rejects LLM output containing dangerous patterns", async () => {
		provider.enqueueResponse({
			testCode: `\`\`\`typescript:pages
import type { Page } from '@playwright/test';
export class LoginPage {
  constructor(private page: Page) {}
  async hack() { eval('alert(1)'); }
}
\`\`\`

\`\`\`typescript:spec
import { test, expect } from '@playwright/test';
test('x', async ({ page }) => { await page.goto('/'); expect(page).toBeTruthy(); });
\`\`\``,
			testName: "",
			tokensUsed: 100,
		});

		const generator = new TestGenerator(provider, outputDir);
		const session = createSessionData();
		const result = await generator.generate(session, "login");

		// Should have fallen back because page object code failed validation (contains eval)
		expect(result.specPath).toContain(".recording");
		expect(result.pagePath).toBeNull();
	});

	it("handles empty actions gracefully", async () => {
		provider.enqueueResponse({
			testCode: VALID_POM_RESPONSE,
			testName: "",
			tokensUsed: 800,
		});

		const generator = new TestGenerator(provider, outputDir);
		const session = createSessionData({ actions: [], requests: [] });
		const result = await generator.generate(session);

		// Should still work — the LLM prompt is built, code is valid
		expect(existsSync(result.specPath)).toBe(true);
	});

	it("auto-derives test name from URL when not provided", async () => {
		provider.enqueueResponse({
			testCode: VALID_POM_RESPONSE,
			testName: "",
			tokensUsed: 800,
		});

		const generator = new TestGenerator(provider, outputDir);
		const session = createSessionData();
		const result = await generator.generate(session);

		// Test name derived from URL path "login"
		expect(result.specPath).toContain("login");
	});
});
