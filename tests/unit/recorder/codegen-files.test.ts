import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for file generation in codegen.ts:
 * writeGeneratedFiles, detectCredentialVars, extractAndReplaceURLs
 *
 * Strategy: Use real tmp directories for filesystem tests, clean up in afterEach.
 */

// Import the functions under test
import {
	sanitizeTestName,
	validateSpecCode,
	writeGeneratedFiles,
} from "../../../src/recorder/codegen.js";

function createTmpDir(): string {
	const dir = join(tmpdir(), `kovar-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function cleanupDir(dir: string): void {
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
}

describe("writeGeneratedFiles — file creation", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = createTmpDir();
	});

	afterEach(() => {
		cleanupDir(tmpDir);
	});

	it("creates spec file, page file, and env example", () => {
		const pages = `import { Page } from '@playwright/test';
export class LoginPage {
	constructor(private page: Page) {}
	async login(email: string) {
		await this.page.fill('#email', email);
	}
}`;

		const spec = `import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
test('login flow', async ({ page }) => {
	await page.goto(BASE_URL);
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "login", pages, spec, "http://localhost:3000");

		expect(result.specPath).toBeTruthy();
		expect(existsSync(result.specPath)).toBe(true);

		expect(result.pagePath).toBeTruthy();
		expect(existsSync(result.pagePath!)).toBe(true);

		expect(result.envExamplePath).toBeTruthy();
		expect(existsSync(result.envExamplePath!)).toBe(true);

		// Verify env file content
		const envContent = readFileSync(result.envExamplePath!, "utf-8");
		expect(envContent).toContain("BASE_URL");
	});

	it("handles unique path resolution when files already exist (appends -1, -2, etc.)", () => {
		const spec = `import { test, expect } from '@playwright/test';
test('dup', async ({ page }) => {
	await page.goto('/');
	expect(page).toBeTruthy();
});`;

		// Create the first file
		const result1 = writeGeneratedFiles(tmpDir, "duplicate", "", spec, "http://localhost:3000");
		expect(result1.specPath).toContain("duplicate.spec.ts");

		// Create the second file — should get a unique name
		const result2 = writeGeneratedFiles(tmpDir, "duplicate", "", spec, "http://localhost:3000");
		expect(result2.specPath).not.toBe(result1.specPath);
		expect(existsSync(result2.specPath)).toBe(true);

		// Create the third file
		const result3 = writeGeneratedFiles(tmpDir, "duplicate", "", spec, "http://localhost:3000");
		expect(result3.specPath).not.toBe(result1.specPath);
		expect(result3.specPath).not.toBe(result2.specPath);
		expect(existsSync(result3.specPath)).toBe(true);
	});

	it("replaces hardcoded URLs with ${BASE_URL}", () => {
		const spec = `import { test, expect } from '@playwright/test';
test('url test', async ({ page }) => {
	await page.goto('http://example.com/login');
	await page.goto('http://example.com/dashboard');
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "url-replace", "", spec, "http://example.com");

		const content = readFileSync(result.specPath, "utf-8");
		expect(content).not.toContain("'http://example.com/login'");
		expect(content).not.toContain("'http://example.com/dashboard'");
		expect(content).toContain("${BASE_URL}");
	});

	it("updates page import path in spec", () => {
		const pages = `import { Page } from '@playwright/test';
export class TestPage {
	constructor(private page: Page) {}
}`;

		const spec = `import { test, expect } from '@playwright/test';
import { TestPage } from './some-old-path.page';
test('import test', async ({ page }) => {
	await page.goto('/');
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "import-test", pages, spec, "http://localhost:3000");

		const content = readFileSync(result.specPath, "utf-8");
		expect(content).toContain("./pages/import-test.page");
	});
});

describe("detectCredentialVars", () => {
	// We test detectCredentialVars indirectly through writeGeneratedFiles,
	// since it's not exported. We verify by checking the .env.example contents.

	let tmpDir: string;

	beforeEach(() => {
		tmpDir = createTmpDir();
	});

	afterEach(() => {
		cleanupDir(tmpDir);
	});

	it("detects BASE_URL, TEST_EMAIL, TEST_PASSWORD, TEST_PHONE, TEST_USERNAME", () => {
		const spec = `import { test, expect } from '@playwright/test';
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const phone = process.env.TEST_PHONE;
const username = process.env.TEST_USERNAME;
const url = process.env.BASE_URL;
test('creds', async ({ page }) => {
	await page.goto(url);
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "creds-test", "", spec, "http://localhost:3000");
		expect(result.envExamplePath).toBeTruthy();

		const envContent = readFileSync(result.envExamplePath!, "utf-8");
		expect(envContent).toContain("BASE_URL=");
		expect(envContent).toContain("TEST_EMAIL=");
		expect(envContent).toContain("TEST_PASSWORD=");
		expect(envContent).toContain("TEST_PHONE=");
		expect(envContent).toContain("TEST_USERNAME=");
	});

	it("detects API_TOKEN, SECRET_KEY, and other secret patterns", () => {
		const spec = `import { test, expect } from '@playwright/test';
const token = process.env.API_TOKEN;
const secret = process.env.SECRET_KEY;
const accessKey = process.env.ACCESS_KEY;
const authToken = process.env.AUTH_TOKEN;
test('secrets', async ({ page }) => {
	await page.goto('/');
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "secrets-test", "", spec, "http://localhost:3000");
		expect(result.envExamplePath).toBeTruthy();

		const envContent = readFileSync(result.envExamplePath!, "utf-8");
		expect(envContent).toContain("API_TOKEN=");
		expect(envContent).toContain("SECRET_KEY=");
		expect(envContent).toContain("ACCESS_KEY=");
		expect(envContent).toContain("AUTH_TOKEN=");
	});
});

describe("extractAndReplaceURLs", () => {
	// We test this indirectly via writeGeneratedFiles, since extractAndReplaceURLs is not exported.

	let tmpDir: string;

	beforeEach(() => {
		tmpDir = createTmpDir();
	});

	afterEach(() => {
		cleanupDir(tmpDir);
	});

	it("replaces origin in string literals", () => {
		const spec = `import { test, expect } from '@playwright/test';
test('url', async ({ page }) => {
	await page.goto('https://app.example.com/api/users');
	const res = 'https://app.example.com/health';
	expect(page).toBeTruthy();
});`;

		const result = writeGeneratedFiles(tmpDir, "url-origin", "", spec, "https://app.example.com");

		const content = readFileSync(result.specPath, "utf-8");
		expect(content).toContain("${BASE_URL}/api/users");
		expect(content).toContain("${BASE_URL}/health");
		expect(content).not.toContain("https://app.example.com/api");
	});

	it("handles invalid URLs gracefully (doesn't throw)", () => {
		const spec = `import { test, expect } from '@playwright/test';
test('invalid url', async ({ page }) => {
	await page.goto('/relative');
	expect(page).toBeTruthy();
});`;

		// Should not throw even with an invalid URL
		expect(() => {
			writeGeneratedFiles(tmpDir, "invalid-url", "", spec, "not-a-valid-url");
		}).not.toThrow();
	});
});
