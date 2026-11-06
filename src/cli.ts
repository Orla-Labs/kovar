import { parseArgs } from "node:util";
import { RecordingSession } from "./recorder/index.js";
import { loadEnvFile } from "./utils/env-file.js";

function parseCliArgs() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			output: { type: "string", short: "o", default: "./tests" },
			name: { type: "string", short: "n" },
			source: { type: "string", short: "s" },
			provider: { type: "string" },
			model: { type: "string" },
			heal: { type: "boolean", default: false },
			yes: { type: "boolean", short: "y", default: false },
			"heal-attempts": { type: "string", default: "3" },
			"db-path": { type: "string" },
			"agent-id": { type: "string" },
			"run-id": { type: "string" },
			format: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	return { values, positionals };
}

type CliValues = Record<string, string | boolean | undefined>;

const MCP_PEERS = ["@modelcontextprotocol/sdk", "better-sqlite3"];

/**
 * The MCP server's dependencies are optional peers so the core assertion library
 * installs without a native SQLite build. Turn a missing peer into an actionable error.
 */
async function loadMcp(): Promise<typeof import("./mcp/index.js")> {
	try {
		return await import("./mcp/index.js");
	} catch (error) {
		const code = (error as NodeJS.ErrnoException)?.code;
		const message = error instanceof Error ? error.message : String(error);
		if (
			(code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") &&
			MCP_PEERS.some((p) => message.includes(p))
		) {
			console.error(
				`\n  ✗ The Kovar MCP server needs optional dependencies that are not installed.\n    Run: npm install -D ${MCP_PEERS.join(" ")}\n`,
			);
			process.exit(1);
		}
		throw error;
	}
}

async function runMcpProxy(positionals: string[], values: CliValues): Promise<void> {
	const childCommand = positionals[2];
	if (!childCommand) {
		console.error(
			"Error: child command is required.\n  Usage: kovar mcp proxy <command> [args...]\n",
		);
		process.exit(1);
	}
	const childArgs = positionals.slice(3);
	const { startProxyServer } = await loadMcp();
	const dbPath = values["db-path"] as string | undefined;
	const agentId = values["agent-id"] as string | undefined;
	const runId = values["run-id"] as string | undefined;
	try {
		await startProxyServer({
			command: childCommand,
			args: childArgs,
			...(dbPath ? { dbPath } : {}),
			...(agentId ? { agentId } : {}),
			...(runId ? { runId } : {}),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`\n  ✗ MCP proxy failed: ${message}\n`);
		process.exit(1);
	}
}

async function runMcpServer(values: CliValues): Promise<void> {
	const { startMcpServer } = await loadMcp();
	const dbPath = values["db-path"] as string | undefined;
	try {
		await startMcpServer(dbPath ? { dbPath } : {});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`\n  ✗ MCP server failed: ${message}\n`);
		process.exit(1);
	}
}

async function runIngest(positionals: string[], values: CliValues): Promise<void> {
	const filePath = positionals[1];
	if (!filePath) {
		console.error("Error: file path is required.\n  Usage: kovar ingest <file> --format <fmt>\n");
		process.exit(1);
	}
	const format = values.format as string | undefined;
	if (!format) {
		console.error("Error: --format is required.\n  Usage: kovar ingest <file> --format <fmt>\n");
		process.exit(1);
	}
	const { ingestFile } = await loadMcp();
	const dbPath = values["db-path"] as string | undefined;
	const agentId = values["agent-id"] as string | undefined;
	const runId = values["run-id"] as string | undefined;
	try {
		const result = await ingestFile({
			filePath,
			format,
			...(agentId ? { agentId } : {}),
			...(runId ? { runId } : {}),
			...(dbPath ? { dbPath } : {}),
		});
		console.error(
			`  ✓ Ingested ${result.eventCount} events, ${result.messageCount} messages into run ${result.runId}\n`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`\n  ✗ Ingest failed: ${message}\n`);
		process.exit(1);
	}
}

async function executeCommand(
	command: string,
	positionals: string[],
	values: CliValues,
): Promise<void> {
	if (command === "mcp") {
		if (positionals[1] === "proxy") {
			await runMcpProxy(positionals, values);
			return;
		}
		await runMcpServer(values);
		return;
	}

	if (command === "ingest") {
		await runIngest(positionals, values);
		return;
	}

	if (command !== "record") {
		console.error(`Unknown command: ${command}\n`);
		printUsage();
		process.exit(1);
	}

	// Only `record` reads ./.env (for LLM keys and BASE_URL/TEST_* used by --heal).
	loadEnvFile();

	const url = positionals[1];
	if (!url) {
		console.error("Error: URL is required.\n  Usage: kovar record <url>\n");
		process.exit(1);
	}

	// --heal executes AI-generated code. Refuse up front, before the user spends time
	// recording, when there is no terminal to confirm on and --yes was not given.
	if (values.heal && !values.yes && !process.stdin.isTTY) {
		console.error(
			"Error: --heal runs AI-generated test code on this machine and needs confirmation.\n  stdin is not a terminal, so pass --heal --yes to run it without a prompt.\n",
		);
		process.exit(1);
	}

	if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
		console.error(
			"Error: No LLM API key found.\n  Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.\n",
		);
		process.exit(1);
	}

	// OpenAI has no default model; fail before recording rather than after.
	const usesOpenAI =
		values.provider === "openai" ||
		(!values.provider && !process.env.ANTHROPIC_API_KEY && !!process.env.OPENAI_API_KEY);
	if (usesOpenAI && !values.model) {
		console.error(
			"Error: the OpenAI provider has no default model.\n  Pass --model with a current OpenAI model ID.\n",
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
		heal: values.heal as boolean | undefined,
		healAttempts: Number.parseInt((values["heal-attempts"] as string) ?? "3", 10),
		healYes: values.yes as boolean | undefined,
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
    record <url>                    Open a browser, record your actions, generate a Playwright test
    mcp                             Start the Kovar MCP server on stdio
    mcp proxy <cmd> [args...]       Proxy an MCP child server, snooping tools/call traffic
    ingest <file> --format <fmt>    Ingest a session file via a registered adapter

  Options:
    -o, --output        Output directory (default: ./tests)
    -n, --name          Test file name (default: auto-generated from URL)
    -s, --source        Source directory for codebase-aware locator generation
    --provider          LLM provider: anthropic or openai (default: auto-detect from env)
    --model             LLM model (Anthropic default: claude-sonnet-5-5; required for OpenAI)
    --heal              Run generated test and auto-fix failures (up to 3 attempts).
                        Executes AI-generated code: asks before each run, or pass --yes
    -y, --yes           With --heal: run without asking (required when stdin is not a TTY)
    --heal-attempts N   Max self-healing attempts (default: 3)
    --db-path           Override SQLite path for the MCP server (default: ~/.kovar/runs.db)
    --agent-id          Agent id for proxy/ingest run records (default: proxy or ingest)
    --run-id            Override run id (default: auto-generated)
    --format            Adapter name for ingest (e.g. kovar-jsonl, claude-code)
    -h, --help          Show this help message

  Environment:
    ANTHROPIC_API_KEY   API key for Claude
    OPENAI_API_KEY      API key for OpenAI (requires --model)
    KOVAR_DB_PATH       Override SQLite path for the MCP server

  Examples:
    kovar record https://myapp.com
    kovar record https://myapp.com -o ./e2e -n checkout-flow
    kovar record https://myapp.com -s ./src
    kovar mcp
    kovar mcp proxy npx @some/mcp-server arg1 arg2
    kovar ingest ./session.jsonl --format kovar-jsonl
    kovar ingest ~/.claude/projects/foo/bar.jsonl --format claude-code
`);
}

main();
