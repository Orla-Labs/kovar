import { mkdtempSync, rmSync } from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestGenerator } from "../../../src/recorder/test-generator.js";
import type { SessionData } from "../../../src/recorder/types.js";
import { MockLLMProvider } from "../../helpers/mock-llm-provider.js";

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
	return {
		startUrl: "https://example.com/login",
		finalUrl: "https://example.com/dashboard",
		pageTitle: "Login",
		actions: [],
		requests: [],
		assertions: [],
		startTime: Date.now(),
		endTime: Date.now() + 5000,
		...overrides,
	};
}

const VALID_POM_RESPONSE = `\`\`\`typescript:pages
import type { Page } from '@playwright/test';
export class LoginPage {
  constructor(private page: Page) {}
  private get emailInput() { return this.page.getByRole('textbox', { name: 'Email' }); }
  async navigate() { await this.page.goto(\`\${process.env.BASE_URL}/login\`); }
}
\`\`\`

\`\`\`typescript:spec
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
test('user logs in', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await expect(page).toHaveURL(/login/);
});
\`\`\``;

describe("TestGenerator", () => {
	let provider: MockLLMProvider;
	let outputDir: string;
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		provider = new MockLLMProvider();
		outputDir = mkdtempSync(join(tmpdir(), "shieldtest-gen-"));
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		rmSync(outputDir, { recursive: true, force: true });
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	it("generates valid POM files when LLM returns proper labeled blocks", async () => {
		provider.enqueueResponse({
			testCode: VALID_POM_RESPONSE,
			testName: "login",
			tokensUsed: 500,
		});

		const generator = new TestGenerator(provider, outputDir);
		const result = await generator.generate(makeSession(), "login");

		expect(result.specPath).toBeTruthy();
		expect(result.pagePath).toBeTruthy();
		expect(existsSync(result.specPath)).toBe(true);
		expect(existsSync(result.pagePath!)).toBe(true);

		const specContent = readFileSync(result.specPath, "utf-8");
		expect(specContent).toContain("test(");
		expect(specContent).toContain("expect");

		const pageContent = readFileSync(result.pagePath!, "utf-8");
		expect(pageContent).toContain("LoginPage");
	});

	it("falls back to recording JSON when LLM throws", async () => {
		provider.setFailOnCall(0, new Error("API key expired"));

		const generator = new TestGenerator(provider, outputDir);
		const result = await generator.generate(makeSession(), "login");

		expect(result.specPath).toContain(".recording");
		expect(result.pagePath).toBeNull();
		expect(existsSync(result.specPath)).toBe(true);

		const content = readFileSync(result.specPath, "utf-8");
		const parsed = JSON.parse(content);
		expect(parsed.startUrl).toBe("https://example.com/login");
	});

	it("validates generated code and rejects dangerous patterns", async () => {
		const dangerousResponse = `\`\`\`typescript:pages
import type { Page } from '@playwright/test';
export class LoginPage {
  constructor(private page: Page) {}
  async stealCookies() { const c = document.cookie; return c; }
}
\`\`\`

\`\`\`typescript:spec
import { test, expect } from '@playwright/test';
test('login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/');
});
\`\`\``;

		provider.enqueueResponse({
			testCode: dangerousResponse,
			testName: "login",
			tokensUsed: 400,
		});

		const generator = new TestGenerator(provider, outputDir);
		const result = await generator.generate(makeSession(), "login");

		// Should fall back to JSON since page object fails validation
		expect(result.specPath).toContain(".recording");
		expect(result.pagePath).toBeNull();
	});
});
