import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { RecordingSession } from "./recorder/index.js";

function loadEnvFile(): void {
	const envPath = resolve(process.cwd(), ".env");
	if (!existsSync(envPath)) return;
	const content = readFileSync(envPath, "utf-8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed
			.slice(eqIndex + 1)
			.trim()
			.replace(/^["']|["']$/g, "");
		if (!process.env[key]) process.env[key] = value;
	}
}

function parseCliArgs() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			output: { type: "string", short: "o", default: "./tests" },
			name: { type: "string", short: "n" },
			source: { type: "string", short: "s" },
			provider: { type: "string" },
			model: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	return { values, positionals };
}

async function executeCommand(
	command: string,
	positionals: string[],
	values: Record<string, string | boolean | undefined>,
): Promise<void> {
	if (command !== "record") {
		console.error(`Unknown command: ${command}\n`);
		printUsage();
		process.exit(1);
	}

	const url = positionals[1];
	if (!url) {
		console.error("Error: URL is required.\n  Usage: kovar record <url>\n");
		process.exit(1);
	}

	if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
		console.error(
			"Error: No LLM API key found.\n  Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.\n",
		);
		process.exit(1);
	}

	const session = new RecordingSession({
		url,
		outputDir: (values.output as string) ?? "./tests",
		testName: values.name as string | undefined,
		sourceDir: values.source as string | undefined,
		provider: values.provider as "anthropic" | "openai" | undefined,
		model: values.model as string | undefined,
	});

	try {
		await session.run();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`\n  ✗ Recording failed: ${message}\n`);
		process.exit(1);
	}
}

async function main() {
	loadEnvFile();
	const { values, positionals } = parseCliArgs();

	if (values.help || positionals.length === 0) {
		printUsage();
		process.exit(positionals.length === 0 && !values.help ? 1 : 0);
	}

	const command = positionals[0] ?? "";
	await executeCommand(command, positionals, values);
}

function printUsage() {
	console.log(`
  kovar — Security testing assertions + AI-powered test recording for Playwright

  Commands:
    record <url>    Open a browser, record your actions, generate a Playwright test

  Options:
    -o, --output    Output directory (default: ./tests)
    -n, --name      Test file name (default: auto-generated from URL)
    -s, --source    Source directory for codebase-aware locator generation
    --provider      LLM provider: anthropic or openai (default: auto-detect from env)
    --model         LLM model (default: claude-sonnet-4-20250514 or gpt-4o)
    -h, --help      Show this help message

  Environment:
    ANTHROPIC_API_KEY   API key for Claude
    OPENAI_API_KEY      API key for GPT-4o

  Examples:
    kovar record https://myapp.com
    kovar record https://myapp.com -o ./e2e -n checkout-flow
    kovar record https://myapp.com -s ./src
`);
}

main();
