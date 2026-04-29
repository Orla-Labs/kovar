import { statSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveDbPath } from "./paths.js";
import { Store, type StoreOptions } from "./store.js";
import { createMcpServer } from "./tools.js";
import { readPackageVersion } from "./validate.js";

export interface StartMcpServerOptions {
	dbPath?: string;
}

let topLevelHandlersInstalled = false;

function installTopLevelHandlers(): void {
	if (topLevelHandlersInstalled) return;
	topLevelHandlersInstalled = true;
	process.on("uncaughtException", (err) => {
		console.error("[kovar mcp] uncaughtException:", err instanceof Error ? err.stack : err);
		process.exit(1);
	});
	process.on("unhandledRejection", (reason) => {
		console.error(
			"[kovar mcp] unhandledRejection:",
			reason instanceof Error ? reason.stack : reason,
		);
		process.exit(1);
	});
}

export async function startMcpServer(options: StartMcpServerOptions = {}): Promise<void> {
	installTopLevelHandlers();

	const storeOpts: StoreOptions = {};
	if (options.dbPath) storeOpts.dbPath = options.dbPath;
	const store = new Store(storeOpts);

	const dbPath = options.dbPath ?? resolveDbPath();
	const version = readPackageVersion();
	if (dbPath === ":memory:") {
		console.error(`kovar mcp v${version} — db: :memory:`);
	} else {
		let sizeMb = "?";
		try {
			const stats = statSync(dbPath);
			sizeMb = (stats.size / 1024 / 1024).toFixed(2);
		} catch {
			// db file may not exist yet on first launch
			sizeMb = "0.00";
		}
		console.error(`kovar mcp v${version} — db: ${dbPath} (${sizeMb} MB)`);
	}

	const server = createMcpServer(store);

	const transport = new StdioServerTransport();
	await server.connect(transport);

	const shutdown = () => {
		store.close();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}
