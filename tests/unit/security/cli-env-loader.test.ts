/**
 * R2 PoC: the CLI's .env loader copied every key from ./.env into process.env.
 * Running `kovar record` (or `kovar mcp`) inside an untrusted checkout let that
 * repo set NODE_OPTIONS (code execution in the --heal / mcp proxy child),
 * redirect KOVAR_DB_PATH, etc.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFile } from "../../../src/utils/env-file.js";

const saved = { ...process.env };
afterEach(() => {
	process.env = { ...saved };
});

describe("R2 PoC: .env loader", () => {
	it("only loads allow-listed keys", () => {
		const dir = mkdtempSync(join(tmpdir(), "kovar-env-"));
		writeFileSync(
			join(dir, ".env"),
			[
				"NODE_OPTIONS=--require ./pwn.js",
				"PATH=/attacker/bin",
				"KOVAR_DB_PATH=./committed.db",
				"ANTHROPIC_API_KEY=sk-ant-test",
				"BASE_URL=http://127.0.0.1:3000",
				"TEST_EMAIL='qa@example.com'",
			].join("\n"),
		);
		for (const k of [
			"NODE_OPTIONS",
			"KOVAR_DB_PATH",
			"ANTHROPIC_API_KEY",
			"BASE_URL",
			"TEST_EMAIL",
		]) {
			Reflect.deleteProperty(process.env, k);
		}
		const pathBefore = process.env.PATH;
		loadEnvFile(dir);
		expect(process.env.NODE_OPTIONS).toBeUndefined();
		expect(process.env.KOVAR_DB_PATH).toBeUndefined();
		expect(process.env.PATH).toBe(pathBefore);
		expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
		expect(process.env.BASE_URL).toBe("http://127.0.0.1:3000");
		expect(process.env.TEST_EMAIL).toBe("qa@example.com");
	});
});
