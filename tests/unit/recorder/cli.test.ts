import { parseArgs } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * Tests for CLI argument parsing from src/cli.ts.
 *
 * We replicate the parseArgs configuration from the CLI to test parsing behavior
 * directly, since the CLI's main() function calls process.exit() and is not
 * easily unit-testable as an import.
 */

function parseCliArgs(args: string[]) {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: {
			output: { type: "string", short: "o", default: "./tests" },
			name: { type: "string", short: "n" },
			source: { type: "string", short: "s" },
			provider: { type: "string" },
			model: { type: "string" },
			heal: { type: "boolean", default: false },
			"heal-attempts": { type: "string", default: "3" },
			help: { type: "boolean", short: "h" },
		},
	});
	return { values, positionals };
}

describe("CLI argument parsing", () => {
	it("parses --heal flag", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "--heal"]);
		expect(values.heal).toBe(true);
	});

	it("parses --heal-attempts 5", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "--heal-attempts", "5"]);
		expect(values["heal-attempts"]).toBe("5");
	});

	it("parses --source ./src", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "--source", "./src"]);
		expect(values.source).toBe("./src");
	});

	it("parses -s ./src (short form)", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "-s", "./src"]);
		expect(values.source).toBe("./src");
	});

	it("parses --provider anthropic", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "--provider", "anthropic"]);
		expect(values.provider).toBe("anthropic");
	});

	it("parses --provider openai", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "--provider", "openai"]);
		expect(values.provider).toBe("openai");
	});

	it("default values are correct (heal=false, healAttempts=3, output=./tests)", () => {
		const { values } = parseCliArgs(["record", "https://example.com"]);
		expect(values.heal).toBe(false);
		expect(values["heal-attempts"]).toBe("3");
		expect(values.output).toBe("./tests");
		expect(values.name).toBeUndefined();
		expect(values.source).toBeUndefined();
		expect(values.provider).toBeUndefined();
		expect(values.model).toBeUndefined();
	});

	it("URL is the first positional argument after command", () => {
		const { positionals } = parseCliArgs(["record", "https://myapp.com"]);
		expect(positionals[0]).toBe("record");
		expect(positionals[1]).toBe("https://myapp.com");
	});

	it("parses --output with short form -o", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "-o", "./e2e"]);
		expect(values.output).toBe("./e2e");
	});

	it("parses --name with short form -n", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "-n", "checkout-flow"]);
		expect(values.name).toBe("checkout-flow");
	});

	it("parses --model flag", () => {
		const { values } = parseCliArgs(["record", "https://example.com", "--model", "gpt-4o"]);
		expect(values.model).toBe("gpt-4o");
	});

	it("parses --help flag", () => {
		const { values } = parseCliArgs(["--help"]);
		expect(values.help).toBe(true);
	});

	it("parses -h short flag for help", () => {
		const { values } = parseCliArgs(["-h"]);
		expect(values.help).toBe(true);
	});
});
