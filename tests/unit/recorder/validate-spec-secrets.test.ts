import { describe, expect, it } from "vitest";
import { validateSpecCode } from "../../../src/recorder/codegen.js";

describe("validateSpecCode — hardcoded secret detection", () => {
	// Helper to wrap code with required patterns so only secret detection is tested
	function wrapValidSpec(line: string): string {
		return `import { test, expect } from '@playwright/test';
test('secret-test', async ({ page }) => {
  ${line}
  await expect(page).toHaveURL('/');
});`;
	}

	it('rejects code containing password = "mysecret"', () => {
		const code = wrapValidSpec('const password = "mysecret123";');
		expect(validateSpecCode(code)).toBe(false);
	});

	it('rejects code containing token: "abc123"', () => {
		const code = wrapValidSpec('const config = { token: "abc123xyz" };');
		expect(validateSpecCode(code)).toBe(false);
	});

	it("rejects code containing .fill('user@email.com')", () => {
		const code = wrapValidSpec("await page.fill('#email', 'user@email.com');");
		// This matches: .fill(...'user@email.com'...)
		// Actually the pattern is: .fill\s*\(\s*['"`][^'"`]*@[^'"`]*\.[^'"`]*['"`]\s*\)
		// which matches .fill('user@email.com') — a single argument fill with email
		const codeDirectFill = wrapValidSpec("await page.locator('#email').fill('user@email.com');");
		expect(validateSpecCode(codeDirectFill)).toBe(false);
	});

	it("rejects code containing .fill(input, 'longpassword123')", () => {
		const code = wrapValidSpec(`await page.fill('#password', 'longpassword123');`);
		expect(validateSpecCode(code)).toBe(false);
	});

	it("accepts code using process.env.TEST_PASSWORD", () => {
		const code = wrapValidSpec("await page.fill('#password', process.env.TEST_PASSWORD || '');");
		expect(validateSpecCode(code)).toBe(true);
	});

	it("accepts code using process.env.API_KEY", () => {
		const code = wrapValidSpec("const apiKey = process.env.API_KEY;");
		expect(validateSpecCode(code)).toBe(true);
	});

	describe("HARDCODED_SECRET_PATTERNS — individual regex coverage", () => {
		it("pattern 1: key = 'value' assignment (password, secret, token, api_key, credential)", () => {
			expect(validateSpecCode(wrapValidSpec('const password = "hunter2";'))).toBe(false);
			expect(validateSpecCode(wrapValidSpec("const secret = 'shh-quiet';"))).toBe(false);
			expect(validateSpecCode(wrapValidSpec('const token = "tok_12345";'))).toBe(false);
			expect(validateSpecCode(wrapValidSpec('const api_key = "key_abcdef";'))).toBe(false);
			expect(validateSpecCode(wrapValidSpec('const apiKey = "key_abcdef";'))).toBe(false);
			expect(validateSpecCode(wrapValidSpec('const credential = "cred123abc";'))).toBe(false);
		});

		it("pattern 2: key: 'value' object literal (password, secret, token, api-key)", () => {
			expect(validateSpecCode(wrapValidSpec('const cfg = { password: "abc123" };'))).toBe(false);
			expect(validateSpecCode(wrapValidSpec('const cfg = { secret: "sshh123" };'))).toBe(false);
			expect(validateSpecCode(wrapValidSpec('const cfg = { token: "tok12345" };'))).toBe(false);
			expect(validateSpecCode(wrapValidSpec('const cfg = { api_key: "key_abc" };'))).toBe(false);
		});

		it("pattern 3: .fill() with direct email string as argument", () => {
			expect(validateSpecCode(wrapValidSpec("await el.fill('admin@company.com');"))).toBe(false);
			expect(validateSpecCode(wrapValidSpec("await el.fill('test.user@domain.io');"))).toBe(false);
		});

		it("pattern 4: .fill(selector, 'long-string-8+ chars') — hardcoded credential in fill", () => {
			expect(validateSpecCode(wrapValidSpec("await page.fill('#pass', 'mypassword');"))).toBe(
				false,
			);
			// Short values (< 8 chars) should pass
			expect(validateSpecCode(wrapValidSpec("await page.fill('#name', 'short');"))).toBe(true);
		});

		it("short assignment values (< 3 chars) are allowed", () => {
			// The regex requires [^'"`]{3,} so values under 3 chars pass
			expect(validateSpecCode(wrapValidSpec('const password = "ab";'))).toBe(true);
		});
	});
});
