/**
 * R2 PoC: `--heal` executes LLM-generated code. The child must not inherit the
 * full parent environment (CI secrets, NODE_OPTIONS), must not let npx fetch
 * packages from the registry, and must not accept sibling-prefix paths.
 */
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelfHealer } from "../../../src/recorder/self-healer.js";
import { MockLLMProvider } from "../../helpers/mock-llm-provider.js";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

const saved = { ...process.env };
afterEach(() => {
	process.env = { ...saved };
	vi.mocked(execFileSync).mockReset();
});

describe("R2 PoC: SelfHealer.runTest child process", () => {
	it("does not pass CI secrets or NODE_OPTIONS to the generated test", () => {
		process.env.AWS_SECRET_ACCESS_KEY = "AKIA_SECRET";
		process.env.GITHUB_TOKEN = "ghs_secret";
		process.env.ANTHROPIC_API_KEY = "sk-ant-secret";
		process.env.NODE_OPTIONS = "--require /tmp/evil.js";
		process.env.BASE_URL = "http://127.0.0.1:3000";
		process.env.TEST_EMAIL = "qa@example.com";
		new SelfHealer(new MockLLMProvider(), "/safe/out").runTest("/safe/out/a.spec.ts");
		const opts = vi.mocked(execFileSync).mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv };
		expect(opts.env, "child env must be explicit, not inherited").toBeDefined();
		expect(opts.env?.AWS_SECRET_ACCESS_KEY).toBeUndefined();
		expect(opts.env?.GITHUB_TOKEN).toBeUndefined();
		expect(opts.env?.ANTHROPIC_API_KEY).toBeUndefined();
		expect(opts.env?.NODE_OPTIONS).toBeUndefined();
		expect(opts.env?.BASE_URL).toBe("http://127.0.0.1:3000");
		expect(opts.env?.TEST_EMAIL).toBe("qa@example.com");
		expect(opts.env?.PATH).toBe(process.env.PATH);
	});

	it("passes variables explicitly opted in via KOVAR_HEAL_ENV (never NODE_OPTIONS)", () => {
		process.env.DATABASE_URL = "postgres://127.0.0.1/test";
		process.env.NODE_OPTIONS = "--require /tmp/evil.js";
		process.env.KOVAR_HEAL_ENV = "DATABASE_URL, NODE_OPTIONS";
		new SelfHealer(new MockLLMProvider(), "/safe/out").runTest("/safe/out/a.spec.ts");
		const opts = vi.mocked(execFileSync).mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv };
		expect(opts.env?.DATABASE_URL).toBe("postgres://127.0.0.1/test");
		expect(opts.env?.NODE_OPTIONS).toBeUndefined();
	});

	it("runs npx without auto-installing from the registry", () => {
		new SelfHealer(new MockLLMProvider(), "/safe/out").runTest("/safe/out/a.spec.ts");
		const args = vi.mocked(execFileSync).mock.calls[0]?.[1] as string[];
		expect(args[0]).toBe("--no");
	});

	it("rejects a sibling directory sharing the output dir prefix", () => {
		const healer = new SelfHealer(new MockLLMProvider(), "/safe/out");
		expect(() => healer.runTest("/safe/out-evil/a.spec.ts")).toThrow("is outside output directory");
	});
});
