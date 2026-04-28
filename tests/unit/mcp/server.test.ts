import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

	it("lists all 8 tools", async () => {
		const result = await ctx.client.listTools();
		const names = result.tools.map((t) => t.name).sort();
		expect(names).toEqual([
			"assert_cost_under",
			"assert_no_drift",
			"assert_tool_called",
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

	it("returns isError for unknown tool", async () => {
		const res = (await ctx.client.callTool({
			name: "does_not_exist",
			arguments: {},
		})) as CallToolResult;
		expect(res.isError).toBe(true);
	});

	it("returns isError when handler throws (e.g. duplicate run_id)", async () => {
		await ctx.client.callTool({
			name: "record_run",
			arguments: { agent_id: "a", run_id: "dup" },
		});
		const dup = (await ctx.client.callTool({
			name: "record_run",
			arguments: { agent_id: "a", run_id: "dup" },
		})) as CallToolResult;
		expect(dup.isError).toBe(true);
		expect(dup.content[0]?.text).toMatch(/already exists/);
	});
});
