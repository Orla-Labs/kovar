import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Store, type StoreOptions } from "./store.js";
import { createMcpServer } from "./tools.js";

export interface StartMcpServerOptions {
	dbPath?: string;
}

export async function startMcpServer(options: StartMcpServerOptions = {}): Promise<void> {
	const storeOpts: StoreOptions = {};
	if (options.dbPath) storeOpts.dbPath = options.dbPath;
	const store = new Store(storeOpts);
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
