import { describe, expect, it, vi } from "vitest";
import { SelfHealer } from "../../../src/recorder/self-healer.js";
import { MockLLMProvider } from "../../helpers/mock-llm-provider.js";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

describe("SelfHealer.runTest — path traversal", () => {
	it("rejects paths outside the output directory", () => {
		const provider = new MockLLMProvider();
		const healer = new SelfHealer(provider, "/safe/output");

		expect(() => healer.runTest("/etc/passwd")).toThrow("is outside output directory");
	});

	it("rejects path traversal via ../", () => {
		const provider = new MockLLMProvider();
		const healer = new SelfHealer(provider, "/safe/output");

		expect(() => healer.runTest("/safe/output/../../../etc/passwd")).toThrow(
			"is outside output directory",
		);
	});

	it("accepts paths within the output directory", () => {
		const provider = new MockLLMProvider();
		const healer = new SelfHealer(provider, "/safe/output");

		// Should not throw — the path is inside the output directory
		// (execFileSync is mocked, so the actual test run won't happen)
		expect(() => healer.runTest("/safe/output/test.spec.ts")).not.toThrow();
	});
});
