import { describe, expect, it } from "vitest";
import {
	extractPOMCode,
	testNameFromUrl,
	validateCode,
	validateSpecCode,
} from "../../../src/recorder/codegen.js";

describe("extractPOMCode", () => {
	it("extracts pages and spec from labeled code blocks", () => {
		const response = `Here is the code:

\`\`\`typescript:pages
import type { Page } from '@playwright/test';
export class LoginPage {
  constructor(private page: Page) {}
  get emailInput() { return this.page.getByRole('textbox'); }
}
\`\`\`

\`\`\`typescript:spec
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
test('login', async ({ page }) => {
  const loginPage = new LoginPage(page);
});
\`\`\``;

		const result = extractPOMCode(response);
		expect(result.pages).toContain("LoginPage");
		expect(result.spec).toContain("test(");
	});

	it("extracts from ts-labeled blocks", () => {
		const response = `\`\`\`ts:pages
import type { Page } from '@playwright/test';
export class MyPage { constructor(private page: Page) {} }
\`\`\`

\`\`\`ts:spec
import { test } from '@playwright/test';
test('x', async ({ page }) => { page.goto('/'); });
\`\`\``;

		const result = extractPOMCode(response);
		expect(result.pages).toContain("MyPage");
		expect(result.spec).toContain("test(");
	});

	it("falls back to single code block when no labels", () => {
		const response = `\`\`\`typescript
import { test } from '@playwright/test';
test('x', async ({ page }) => { page.goto('/'); });
\`\`\``;

		const result = extractPOMCode(response);
		expect(result.pages).toBe("");
		expect(result.spec).toContain("test(");
	});

	it("throws when no fences even if response has import", () => {
		const response = `import { test } from '@playwright/test';
test('x', async ({ page }) => { page.goto('/'); });`;

		expect(() => extractPOMCode(response)).toThrow("did not contain TypeScript code blocks");
	});

	it("throws when no code block and no import keyword", () => {
		expect(() => extractPOMCode("Here is some explanation without code.")).toThrow(
			"did not contain TypeScript code blocks",
		);
	});

	it("normalizes import from 'playwright' to '@playwright/test'", () => {
		const response = `\`\`\`typescript:spec
import { test } from 'playwright';
test('x', async ({ page }) => { page.goto('/'); });
\`\`\``;

		const result = extractPOMCode(response);
		expect(result.spec).toContain("from '@playwright/test'");
		expect(result.spec).not.toContain("from 'playwright'");
	});
});

describe("validateCode", () => {
	it("returns true for valid page object code", () => {
		const code = `import type { Page } from '@playwright/test';
export class LoginPage {
  constructor(private page: Page) {}
}`;
		expect(validateCode(code)).toBe(true);
	});

	it("returns false when missing import", () => {
		expect(validateCode("const page = something;")).toBe(false);
	});

	it("returns false for code containing eval()", () => {
		expect(validateCode("import { x } from 'y'; eval('page.goto()');")).toBe(false);
	});

	it("returns false for code containing require()", () => {
		expect(validateCode("import { x } from 'y'; const fs = require('fs'); page.x();")).toBe(false);
	});

	it("returns false for code containing child_process", () => {
		expect(validateCode("import { x } from 'y'; import child_process; page.x();")).toBe(false);
	});

	it("returns false for code containing exec()", () => {
		expect(validateCode("import { x } from 'y'; exec('rm -rf /'); page.x();")).toBe(false);
	});

	it("returns false for code containing fs.*Sync", () => {
		expect(validateCode("import { x } from 'y'; fs.unlinkSync('/etc/passwd'); page.x();")).toBe(
			false,
		);
	});

	it("returns false for code containing process.exit", () => {
		expect(validateCode("import { x } from 'y'; process.exit(1); page.x();")).toBe(false);
	});
});

describe("validateSpecCode", () => {
	it("returns true for valid spec code", () => {
		const code = `import { test, expect } from '@playwright/test';
test('login', async ({ page }) => { page.goto('/'); });`;
		expect(validateSpecCode(code)).toBe(true);
	});

	it("returns false when missing test(", () => {
		const code = `import { x } from '@playwright/test';
const page = something;`;
		expect(validateSpecCode(code)).toBe(false);
	});
});

describe("validateCode — data exfiltration patterns", () => {
	it("returns false for code containing navigator.sendBeacon", () => {
		expect(
			validateCode("import { x } from 'y'; navigator.sendBeacon('/log', data); page.x();"),
		).toBe(false);
	});

	it("returns false for code containing document.cookie", () => {
		expect(validateCode("import { x } from 'y'; const c = document.cookie; page.x();")).toBe(false);
	});

	it("returns false for code containing localStorage", () => {
		expect(validateCode("import { x } from 'y'; localStorage.setItem('k', 'v'); page.x();")).toBe(
			false,
		);
	});

	it("returns false for code containing sessionStorage", () => {
		expect(validateCode("import { x } from 'y'; sessionStorage.getItem('k'); page.x();")).toBe(
			false,
		);
	});
});

describe("validateSpecCode — data exfiltration patterns", () => {
	it("returns false for spec code with navigator.sendBeacon", () => {
		const code = `import { test, expect } from '@playwright/test';
test('x', async ({ page }) => { navigator.sendBeacon('/exfil', data); expect(page).toBeTruthy(); });`;
		expect(validateSpecCode(code)).toBe(false);
	});

	it("returns false for spec code with document.cookie", () => {
		const code = `import { test, expect } from '@playwright/test';
test('x', async ({ page }) => { const c = document.cookie; expect(page).toBeTruthy(); });`;
		expect(validateSpecCode(code)).toBe(false);
	});

	it("returns false for spec code with localStorage", () => {
		const code = `import { test, expect } from '@playwright/test';
test('x', async ({ page }) => { localStorage.getItem('secret'); expect(page).toBeTruthy(); });`;
		expect(validateSpecCode(code)).toBe(false);
	});

	it("returns false for spec code with sessionStorage", () => {
		const code = `import { test, expect } from '@playwright/test';
test('x', async ({ page }) => { sessionStorage.getItem('token'); expect(page).toBeTruthy(); });`;
		expect(validateSpecCode(code)).toBe(false);
	});
});

describe("testNameFromUrl", () => {
	it("extracts path from URL as test name", () => {
		expect(testNameFromUrl("https://example.com/checkout")).toBe("checkout");
	});

	it("handles root URL", () => {
		expect(testNameFromUrl("https://example.com/")).toBe("recorded-test");
	});

	it("handles trailing slashes", () => {
		expect(testNameFromUrl("https://example.com/shop/")).toBe("shop");
	});

	it("replaces slashes with dashes", () => {
		expect(testNameFromUrl("https://example.com/admin/users")).toBe("admin-users");
	});

	it("handles invalid URLs gracefully", () => {
		expect(testNameFromUrl("not-a-url")).toBe("recorded-test");
	});
});
