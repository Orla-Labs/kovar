import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	SelfHealer,
	healConfirmInteractive,
	healConfirmYes,
} from "../../../src/recorder/self-healer.js";
import { MockLLMProvider } from "../../helpers/mock-llm-provider.js";

// --heal executes AI-generated code. The advisory states it requires confirmation:
// --yes, or a TTY prompt before EVERY execution (attempts 2..N run new LLM output).

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

const failing = () => {
	throw Object.assign(new Error("fail"), { stdout: "1 failed", stderr: "" });
};

afterEach(() => {
	vi.mocked(execFileSync).mockReset();
	vi.restoreAllMocks();
});

describe("--heal confirmation", () => {
	it("does not execute the test when confirmation is refused", async () => {
		const confirm = vi.fn(async () => false);
		await new SelfHealer(new MockLLMProvider(), "./tests", 3, confirm).heal(
			"./tests/a.spec.ts",
			null,
		);
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(execFileSync).not.toHaveBeenCalled();
	});

	it("asks before every attempt, not only the first", async () => {
		vi.mocked(execFileSync).mockImplementation(failing);
		const provider = new MockLLMProvider();
		vi.spyOn(provider, "generate").mockResolvedValue({
			testCode:
				'```typescript:spec\nimport { test, expect } from "@playwright/test";\ntest("x", async ({ page }) => { await page.goto("/"); await expect(page).toHaveURL("/"); });\n```',
			testName: "x",
			tokensUsed: 1,
		});
		const answers = [true, false];
		const confirm = vi.fn(async () => answers.shift() ?? false);
		await new SelfHealer(provider, "./tests", 3, confirm).heal("./tests/a.spec.ts", null);
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(confirm.mock.calls.map((c) => c[1])).toEqual([1, 2]);
		expect(execFileSync).toHaveBeenCalledTimes(1);
	});

	it("the default (interactive) confirmation refuses when stdin is not a TTY", async () => {
		const original = process.stdin.isTTY;
		Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
		vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(await healConfirmInteractive("./tests/a.spec.ts", 1)).toBe(false);
			await new SelfHealer(new MockLLMProvider(), "./tests").heal("./tests/a.spec.ts", null);
			expect(execFileSync).not.toHaveBeenCalled();
		} finally {
			Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
		}
	});

	it("--yes runs without asking", async () => {
		expect(await healConfirmYes("./tests/a.spec.ts", 1)).toBe(true);
		await new SelfHealer(new MockLLMProvider(), "./tests", 3, healConfirmYes).heal(
			"./tests/a.spec.ts",
			null,
		);
		expect(execFileSync).toHaveBeenCalledTimes(1);
	});
});
