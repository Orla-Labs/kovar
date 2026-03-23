import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeGeneratedFiles } from "../../../src/recorder/codegen.js";

describe("writeGeneratedFiles", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "codegen-files-"));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("creates spec and page files in output directory", () => {
		const pages = `import { Page } from '@playwright/test';
export class LoginPage {
	constructor(private page: Page) {}
	async navigate() {
		await this.page.goto('/login');
	}
}`;

		const spec = `import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
test('login flow', async ({ page }) => {
	const loginPage = new LoginPage(page);
	await loginPage.navigate();
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "login", pages, spec, "https://myapp.com/login");

		expect(existsSync(result.specPath)).toBe(true);
		expect(result.pagePath).not.toBeNull();
		expect(existsSync(result.pagePath!)).toBe(true);
		expect(result.pagePath!).toContain(join("pages", ""));
	});

	it("replaces hardcoded URLs with BASE_URL", () => {
		const spec = `import { test, expect } from '@playwright/test';
test('url test', async ({ page }) => {
	await page.goto('https://myapp.com/login');
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "url-replace", "", spec, "https://myapp.com");

		const content = readFileSync(result.specPath, "utf-8");
		expect(content).not.toContain("'https://myapp.com/login'");
		expect(content).toContain("${BASE_URL}/login");
	});

	it("generates .env.example when credentials are detected", () => {
		const spec = `import { test, expect } from '@playwright/test';
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
test('login with creds', async ({ page }) => {
	await page.goto('/login');
	await page.fill('#email', email);
	await page.fill('#password', password);
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "creds", "", spec, "https://myapp.com");

		expect(result.envExamplePath).not.toBeNull();
		expect(existsSync(result.envExamplePath!)).toBe(true);

		const envContent = readFileSync(result.envExamplePath!, "utf-8");
		expect(envContent).toContain("TEST_EMAIL");
		expect(envContent).toContain("TEST_PASSWORD");
	});

	it("handles empty pages string (spec-only output)", () => {
		const spec = `import { test, expect } from '@playwright/test';
test('spec only', async ({ page }) => {
	await page.goto('/');
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "spec-only", "", spec, "https://myapp.com");

		expect(result.pagePath).toBeNull();
		expect(existsSync(result.specPath)).toBe(true);
	});

	it("resolves unique path when file already exists", () => {
		const spec = `import { test, expect } from '@playwright/test';
test('dup test', async ({ page }) => {
	await page.goto('/');
	expect(page).toBeTruthy();
});`;

		const result1 = writeGeneratedFiles(tmpDir, "duplicate", "", spec, "https://myapp.com");
		const result2 = writeGeneratedFiles(tmpDir, "duplicate", "", spec, "https://myapp.com");

		expect(result1.specPath).not.toBe(result2.specPath);
		expect(existsSync(result1.specPath)).toBe(true);
		expect(existsSync(result2.specPath)).toBe(true);
		expect(result2.specPath).toContain("-1");
	});
});
