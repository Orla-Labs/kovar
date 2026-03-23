import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLLMProvider } from "../../helpers/index.js";

// Mock child_process before importing the module under test
vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));

// Mock fs operations
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SelfHealer } from "../../../src/recorder/self-healer.js";

const mockedExecFileSync = vi.mocked(execFileSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function createHealer(overrides: { maxAttempts?: number; outputDir?: string } = {}) {
	const provider = new MockLLMProvider();
	const healer = new SelfHealer(
		provider,
		overrides.outputDir ?? "./tests",
		overrides.maxAttempts ?? 3,
	);
	return { healer, provider };
}

function makeValidSpecResponse(code: string) {
	return {
		testCode: `\`\`\`typescript:spec\n${code}\n\`\`\``,
		testName: "fix-test",
		tokensUsed: 100,
	};
}

describe("runTest", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns { passed: true } when execFileSync succeeds", () => {
		mockedExecFileSync.mockReturnValue("");
		const { healer } = createHealer();
		const outcome = healer.runTest("./tests/my-test.spec.ts");
		expect(outcome.passed).toBe(true);
		expect(outcome.error).toBe("");
	});

	it("returns { passed: false, error } when execFileSync throws", () => {
		const err = new Error("Test failed") as Error & { stderr?: string };
		err.stderr = "FAIL: expected visible but element not found";
		mockedExecFileSync.mockImplementation(() => {
			throw err;
		});
		const { healer } = createHealer();
		const outcome = healer.runTest("./tests/my-test.spec.ts");
		expect(outcome.passed).toBe(false);
		expect(outcome.error).toContain("expected visible but element not found");
	});

	it("truncates error to 2000 chars", () => {
		const longStderr = "E".repeat(5000);
		const err = new Error("Test failed") as Error & { stderr?: string };
		err.stderr = longStderr;
		mockedExecFileSync.mockImplementation(() => {
			throw err;
		});
		const { healer } = createHealer();
		const outcome = healer.runTest("./tests/my-test.spec.ts");
		expect(outcome.passed).toBe(false);
		expect(outcome.error.length).toBe(2000);
	});

	it("passes correct args to execFileSync", () => {
		mockedExecFileSync.mockReturnValue("");
		const { healer } = createHealer();
		healer.runTest("./tests/my-test.spec.ts");
		expect(mockedExecFileSync).toHaveBeenCalledWith(
			"npx",
			["playwright", "test", "./tests/my-test.spec.ts", "--reporter=line"],
			expect.objectContaining({
				timeout: 60000,
				stdio: "pipe",
				encoding: "utf-8",
			}),
		);
	});
});

describe("heal", () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleWarnSpy.mockRestore();
	});

	it("test passes on first attempt — no LLM calls made", async () => {
		mockedExecFileSync.mockReturnValue("");
		const { healer, provider } = createHealer({ maxAttempts: 3 });

		await healer.heal("./tests/my-test.spec.ts", null);

		expect(provider.getCallCount()).toBe(0);
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("test passed"));
	});

	it("test fails attempt 1, LLM provides fix, test passes attempt 2", async () => {
		let callCount = 0;
		mockedExecFileSync.mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				const err = new Error("Test failed") as Error & { stderr?: string };
				err.stderr = "Element not found";
				throw err;
			}
			return "";
		});

		mockedReadFileSync.mockReturnValue(
			"import { test, expect } from '@playwright/test';\ntest('x', async ({ page }) => { await expect(page).toHaveURL('/'); });",
		);
		mockedExistsSync.mockReturnValue(true);

		const validSpec =
			"import { test, expect } from '@playwright/test';\ntest('fixed', async ({ page }) => { await expect(page).toHaveURL('/fixed'); });";
		const { healer, provider } = createHealer({ maxAttempts: 3 });
		provider.enqueueResponse(makeValidSpecResponse(validSpec));

		await healer.heal("./tests/my-test.spec.ts", null);

		expect(provider.getCallCount()).toBe(1);
		expect(mockedWriteFileSync).toHaveBeenCalled();
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("test passed"));
	});

	it("test fails all N attempts, logs warning and returns", async () => {
		const err = new Error("Test failed") as Error & { stderr?: string };
		err.stderr = "Persistent failure";
		mockedExecFileSync.mockImplementation(() => {
			throw err;
		});

		mockedReadFileSync.mockReturnValue(
			"import { test, expect } from '@playwright/test';\ntest('x', async ({ page }) => { await expect(page).toHaveURL('/'); });",
		);
		mockedExistsSync.mockReturnValue(true);

		const validSpec =
			"import { test, expect } from '@playwright/test';\ntest('still-broken', async ({ page }) => { await expect(page).toHaveURL('/broken'); });";
		const { healer, provider } = createHealer({ maxAttempts: 3 });
		provider.enqueueResponse(makeValidSpecResponse(validSpec));
		provider.enqueueResponse(makeValidSpecResponse(validSpec));

		await healer.heal("./tests/my-test.spec.ts", null);

		// 3 attempts: attempt 1 fails -> LLM fix -> attempt 2 fails -> LLM fix -> attempt 3 fails -> done
		expect(provider.getCallCount()).toBe(2);
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining("still failing after 3 attempts"),
		);
	});

	it("LLM returns code that fails validateSpecCode — loop bails out early", async () => {
		const err = new Error("Test failed") as Error & { stderr?: string };
		err.stderr = "Element not found";
		mockedExecFileSync.mockImplementation(() => {
			throw err;
		});

		mockedReadFileSync.mockReturnValue(
			"import { test, expect } from '@playwright/test';\ntest('x', async ({ page }) => { await expect(page).toHaveURL('/'); });",
		);
		mockedExistsSync.mockReturnValue(true);

		// Return invalid code (no test( pattern, no expect)
		const { healer, provider } = createHealer({ maxAttempts: 3 });
		provider.enqueueResponse({
			testCode: "```typescript:spec\nconst x = 1;\n```",
			testName: "bad-fix",
			tokensUsed: 50,
		});

		await healer.heal("./tests/my-test.spec.ts", null);

		// Should have called LLM once, then bailed because validation failed
		expect(provider.getCallCount()).toBe(1);
		expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("failed validation"));
		// Should NOT have written files (validation failed)
		expect(mockedWriteFileSync).not.toHaveBeenCalled();
	});
});
