import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store } from "../../../src/mcp/store.js";
import { createMcpServer } from "../../../src/mcp/tools.js";

interface CallToolResult {
	isError?: boolean;
	content: Array<{ type: string; text: string }>;
}

async function setup() {
	const store = new Store({ dbPath: ":memory:" });
	const server = createMcpServer(store);
	const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);

	const client = new Client({ name: "test-client", version: "0.0.0" }, {});
	await client.connect(clientTransport);
	return { client, server, store };
}

function parseToolResult<T>(res: CallToolResult): T {
	expect(res.isError).not.toBe(true);
	const text = res.content[0]?.text;
	expect(text).toBeDefined();
	return JSON.parse(text as string) as T;
}

function parseErrorResult(res: CallToolResult): {
	code: string;
	message: string;
	hint?: string;
	errors?: { path: string; message: string }[];
} {
	expect(res.isError).toBe(true);
	const text = res.content[0]?.text;
	expect(text).toBeDefined();
	return JSON.parse(text as string);
}

describe("MCP server (in-memory transport)", () => {
	let ctx: Awaited<ReturnType<typeof setup>>;

	beforeEach(async () => {
		ctx = await setup();
	});

	afterEach(async () => {
		await ctx.client.close();
		await ctx.server.close();
		ctx.store.close();
	});

	it("lists all 15 tools", async () => {
		const result = await ctx.client.listTools();
		const names = result.tools.map((t) => t.name).sort();
		expect(names).toEqual([
			"append_events",
			"assert_cost_under",
			"assert_latency_under",
			"assert_messages_match",
			"assert_no_drift",
			"assert_no_loops",
			"assert_token_budget_per_step",
			"assert_tool_called",
			"assert_tool_order",
			"diff_runs",
			"get_run",
			"list_runs",
			"record_canonical",
			"record_run",
			"replay_run",
		]);
	});

	it("round-trips: record_run -> assert_tool_called -> get_run", async () => {
		const recordRes = (await ctx.client.callTool({
			name: "record_run",
			arguments: {
				agent_id: "agent-a",
				run_id: "r1",
				events: [
					{ tool_name: "Read", args: { path: "/foo" }, timestamp: 1, cost_usd: 0.01 },
					{ tool_name: "Edit", args: { path: "/foo" }, timestamp: 2, cost_usd: 0.02 },
				],
			},
		})) as CallToolResult;
		const recordParsed = parseToolResult<{ event_count: number }>(recordRes);
		expect(recordParsed.event_count).toBe(2);

		const assertRes = (await ctx.client.callTool({
			name: "assert_tool_called",
			arguments: { run_id: "r1", tool_name: "Read", args: { path: "/foo" } },
		})) as CallToolResult;
		const assertParsed = parseToolResult<{ passed: boolean; actual_count: number }>(assertRes);
		expect(assertParsed.passed).toBe(true);
		expect(assertParsed.actual_count).toBe(1);

		const getRes = (await ctx.client.callTool({
			name: "get_run",
			arguments: { run_id: "r1" },
		})) as CallToolResult;
		const got = parseToolResult<{
			run: { id: string; agentId: string };
			events: Array<{ tool_name: string }>;
		}>(getRes);
		expect(got.run.id).toBe("r1");
		expect(got.events.map((e) => e.tool_name)).toEqual(["Read", "Edit"]);
	});

	it("returns isError with INVALID_INPUT JSON for unknown tool", async () => {
		const res = (await ctx.client.callTool({
			name: "does_not_exist",
			arguments: {},
		})) as CallToolResult;
		const err = parseErrorResult(res);
		expect(err.code).toBe("INVALID_INPUT");
		expect(err.message).toMatch(/Unknown tool/);
	});

	it("returns isError JSON when handler throws (e.g. duplicate run_id)", async () => {
		await ctx.client.callTool({
			name: "record_run",
			arguments: { agent_id: "a", run_id: "dup" },
		});
		const dup = (await ctx.client.callTool({
			name: "record_run",
			arguments: { agent_id: "a", run_id: "dup" },
		})) as CallToolResult;
		const err = parseErrorResult(dup);
		expect(err.code).toBe("RUN_DUPLICATE");
		expect(err.message).toMatch(/already exists/);
		expect(err.hint).toBeDefined();
	});

	it("returns INVALID_INPUT for malformed arguments (events as string)", async () => {
		const res = (await ctx.client.callTool({
			name: "record_run",
			arguments: { agent_id: "a", run_id: "r1", events: "not-an-array" },
		})) as CallToolResult;
		const err = parseErrorResult(res);
		expect(err.code).toBe("INVALID_INPUT");
		expect(err.errors?.length).toBeGreaterThan(0);
		expect(err.errors?.[0]?.path).toContain("events");
	});

	it("returns INVALID_INPUT when required field missing", async () => {
		const res = (await ctx.client.callTool({
			name: "record_run",
			arguments: { agent_id: "a" },
		})) as CallToolResult;
		const err = parseErrorResult(res);
		expect(err.code).toBe("INVALID_INPUT");
		expect(err.errors?.some((e) => e.path === "run_id")).toBe(true);
	});

	it("returns INVALID_INPUT when additional property is provided", async () => {
		const res = (await ctx.client.callTool({
			name: "record_run",
			arguments: { agent_id: "a", run_id: "r1", bogus: 1 },
		})) as CallToolResult;
		const err = parseErrorResult(res);
		expect(err.code).toBe("INVALID_INPUT");
	});

	it("returns RUN_NOT_FOUND with hint when referencing missing run", async () => {
		const res = (await ctx.client.callTool({
			name: "assert_tool_called",
			arguments: { run_id: "missing", tool_name: "X" },
		})) as CallToolResult;
		const err = parseErrorResult(res);
		expect(err.code).toBe("RUN_NOT_FOUND");
		expect(err.hint).toBeDefined();
	});

	it("serverInfo.version matches package.json version", async () => {
		const pkg = JSON.parse(
			readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
		) as { version: string };
		const serverVersion = ctx.client.getServerVersion();
		expect(serverVersion?.name).toBe("@orlalabs/kovar");
		expect(serverVersion?.version).toBe(pkg.version);
	});
});

describe("startMcpServer banner", () => {
	it("logs a startup banner to stderr including version and db path", async () => {
		const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { startMcpServer } = await import("../../../src/mcp/server.js");
			// Use a port-ish dummy: stdio transport will hang; we rely on banner being emitted before connect.
			// Run in a microtask and abort by closing store via SIGINT-equivalent.
			const promise = startMcpServer({ dbPath: ":memory:" });
			// Give the banner a tick to emit (it's synchronous before await transport.connect)
			await Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, 50))]);
			const calls = consoleErrSpy.mock.calls.map((c) => String(c[0]));
			const banner = calls.find((c) => c.includes("kovar mcp v"));
			expect(banner).toBeDefined();
			expect(banner).toContain(":memory:");
		} finally {
			consoleErrSpy.mockRestore();
			stderrSpy.mockRestore();
		}
	}, 10000);
});
