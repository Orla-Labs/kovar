import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
	assertCostUnderSchema,
	assertNoDriftSchema,
	assertToolCalledSchema,
	getRunSchema,
	listRunsSchema,
	recordCanonicalSchema,
	recordRunSchema,
	replayRunSchema,
} from "./schema.js";
import type { EventInput, Store } from "./store.js";
import type { DriftDiffEntry, DriftReport, RunStatus, ToolCallEvent } from "./types.js";

export const TOOL_DEFS = [
	{
		name: "record_run",
		description:
			"Record an agent run, including its tool-call events. Idempotent per run_id (errors if the run_id already exists).",
		inputSchema: recordRunSchema,
	},
	{
		name: "assert_tool_called",
		description:
			"Assert a tool was invoked in the run. If 'count' is given, requires exact count; otherwise requires ≥1. If 'args' is given, only events whose args contain those key/value pairs match.",
		inputSchema: assertToolCalledSchema,
	},
	{
		name: "assert_no_drift",
		description:
			"Assert the run's tool sequence matches a recorded canonical path. Returns a diff if it does not.",
		inputSchema: assertNoDriftSchema,
	},
	{
		name: "assert_cost_under",
		description: "Assert the run's total cost (sum of event cost_usd) is below the threshold.",
		inputSchema: assertCostUnderSchema,
	},
	{
		name: "replay_run",
		description:
			"Return the recorded events for a run, optionally starting from a given seq. The client is expected to re-execute the events.",
		inputSchema: replayRunSchema,
	},
	{
		name: "record_canonical",
		description:
			"Record a canonical tool sequence from one or more runs. All runs must have the same tool sequence.",
		inputSchema: recordCanonicalSchema,
	},
	{
		name: "get_run",
		description: "Fetch a recorded run with its events.",
		inputSchema: getRunSchema,
	},
	{
		name: "list_runs",
		description: "List recorded runs, optionally filtered by agent_id, newest first.",
		inputSchema: listRunsSchema,
	},
] as const;

type ToolName = (typeof TOOL_DEFS)[number]["name"];

interface RecordRunArgs {
	agent_id: string;
	run_id: string;
	metadata?: Record<string, unknown>;
	events?: Array<{
		tool_name: string;
		args?: Record<string, unknown>;
		result?: unknown;
		cost_usd?: number;
		timestamp: number;
	}>;
	status?: RunStatus;
}

interface AssertToolCalledArgs {
	run_id: string;
	tool_name: string;
	args?: Record<string, unknown>;
	count?: number;
}

interface AssertNoDriftArgs {
	run_id: string;
	canonical_name: string;
}

interface AssertCostUnderArgs {
	run_id: string;
	usd: number;
}

interface ReplayRunArgs {
	run_id: string;
	from_event_id?: number;
}

interface RecordCanonicalArgs {
	name: string;
	run_ids: string[];
}

interface GetRunArgs {
	run_id: string;
}

interface ListRunsArgs {
	agent_id?: string;
}

type ToolHandler = (store: Store, args: Record<string, unknown>) => unknown;

function eventToWire(e: ToolCallEvent) {
	return {
		seq: e.seq,
		tool_name: e.toolName,
		args: e.args,
		result: e.result,
		cost_usd: e.costUsd,
		timestamp: e.timestamp,
	};
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null || a === undefined || b === undefined) return false;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object") return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((x, i) => deepEqual(x, b[i]));
	}
	const oa = a as Record<string, unknown>;
	const ob = b as Record<string, unknown>;
	const ka = Object.keys(oa);
	const kb = Object.keys(ob);
	if (ka.length !== kb.length) return false;
	return ka.every((k) => deepEqual(oa[k], ob[k]));
}

function isSubset(subset: Record<string, unknown>, full: Record<string, unknown>): boolean {
	for (const [k, v] of Object.entries(subset)) {
		if (!(k in full)) return false;
		if (!deepEqual(v, full[k])) return false;
	}
	return true;
}

function computeDrift(expected: string[], actual: string[]): DriftReport {
	const len = Math.max(expected.length, actual.length);
	const diff: DriftDiffEntry[] = [];
	for (let i = 0; i < len; i++) {
		const e = i < expected.length ? expected[i] : null;
		const a = i < actual.length ? actual[i] : null;
		if (e !== a) diff.push({ index: i, expected: e ?? null, actual: a ?? null });
	}
	return { matched: diff.length === 0, expected, actual, diff };
}

export const HANDLERS: Record<ToolName, ToolHandler> = {
	record_run: (store, raw) => {
		const args = raw as unknown as RecordRunArgs;
		if (!args.agent_id || !args.run_id) throw new Error("agent_id and run_id are required");
		if (store.getRun(args.run_id)) throw new Error(`Run '${args.run_id}' already exists`);
		const events = args.events ?? [];
		const startedAt = events[0]?.timestamp ?? Date.now();
		const endedAt = events[events.length - 1]?.timestamp ?? startedAt;
		const status: RunStatus = args.status ?? "completed";
		store.createRun({
			id: args.run_id,
			agentId: args.agent_id,
			status,
			startedAt,
			endedAt,
			metadata: args.metadata ?? {},
		});
		const eventInputs: EventInput[] = events.map((e) => ({
			toolName: e.tool_name,
			args: e.args ?? {},
			result: e.result === undefined ? null : e.result,
			costUsd: e.cost_usd ?? null,
			timestamp: e.timestamp,
		}));
		const stored = store.appendEvents(args.run_id, eventInputs);
		return { run_id: args.run_id, event_count: stored.length, status };
	},

	assert_tool_called: (store, raw) => {
		const args = raw as unknown as AssertToolCalledArgs;
		if (!store.getRun(args.run_id)) throw new Error(`Run '${args.run_id}' not found`);
		const events = store.getEvents(args.run_id);
		const matches = events.filter(
			(e) =>
				e.toolName === args.tool_name && (args.args === undefined || isSubset(args.args, e.args)),
		);
		const passed = args.count !== undefined ? matches.length === args.count : matches.length >= 1;
		return {
			passed,
			tool_name: args.tool_name,
			actual_count: matches.length,
			expected_count: args.count ?? null,
		};
	},

	assert_no_drift: (store, raw) => {
		const args = raw as unknown as AssertNoDriftArgs;
		if (!store.getRun(args.run_id)) throw new Error(`Run '${args.run_id}' not found`);
		const canonical = store.getCanonical(args.canonical_name);
		if (!canonical) throw new Error(`Canonical '${args.canonical_name}' not found`);
		const actual = store.getEvents(args.run_id).map((e) => e.toolName);
		const report = computeDrift(canonical.toolSequence, actual);
		return { passed: report.matched, ...report, canonical_name: args.canonical_name };
	},

	assert_cost_under: (store, raw) => {
		const args = raw as unknown as AssertCostUnderArgs;
		if (!store.getRun(args.run_id)) throw new Error(`Run '${args.run_id}' not found`);
		const events = store.getEvents(args.run_id);
		const total = events.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
		return { passed: total < args.usd, total_cost_usd: total, threshold_usd: args.usd };
	},

	replay_run: (store, raw) => {
		const args = raw as unknown as ReplayRunArgs;
		if (!store.getRun(args.run_id)) throw new Error(`Run '${args.run_id}' not found`);
		const events = store.getEvents(args.run_id, args.from_event_id ?? 0);
		return { run_id: args.run_id, events: events.map(eventToWire) };
	},

	record_canonical: (store, raw) => {
		const args = raw as unknown as RecordCanonicalArgs;
		if (!Array.isArray(args.run_ids) || args.run_ids.length === 0) {
			throw new Error("run_ids must be a non-empty array");
		}
		const sequences = args.run_ids.map((id) => {
			if (!store.getRun(id)) throw new Error(`Run '${id}' not found`);
			return store.getEvents(id).map((e) => e.toolName);
		});
		const reference = sequences[0];
		if (!reference) throw new Error("No runs provided");
		for (let i = 1; i < sequences.length; i++) {
			const seq = sequences[i];
			if (!seq) continue;
			const matches = seq.length === reference.length && seq.every((t, j) => t === reference[j]);
			if (!matches) {
				throw new Error(
					`Run '${args.run_ids[i]}' tool sequence does not match run '${args.run_ids[0]}'`,
				);
			}
		}
		const createdAt = Date.now();
		store.upsertCanonical({ name: args.name, toolSequence: reference, createdAt });
		return {
			name: args.name,
			tool_sequence: reference,
			source_run_count: args.run_ids.length,
			created_at: createdAt,
		};
	},

	get_run: (store, raw) => {
		const args = raw as unknown as GetRunArgs;
		const run = store.getRun(args.run_id);
		if (!run) throw new Error(`Run '${args.run_id}' not found`);
		const events = store.getEvents(args.run_id);
		return { run, events: events.map(eventToWire) };
	},

	list_runs: (store, raw) => {
		const args = raw as unknown as ListRunsArgs;
		const runs = store.listRuns(args.agent_id);
		return { runs };
	},
};

export function registerTools(server: Server, store: Store): void {
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: TOOL_DEFS.map((t) => ({ ...t })),
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const name = request.params.name as ToolName;
		const handler = HANDLERS[name];
		if (!handler) {
			return {
				isError: true,
				content: [{ type: "text", text: `Unknown tool: ${name}` }],
			};
		}
		const args = (request.params.arguments ?? {}) as Record<string, unknown>;
		try {
			const result = await handler(store, args);
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				isError: true,
				content: [{ type: "text", text: message }],
			};
		}
	});
}

export function createMcpServer(store: Store): Server {
	const server = new Server(
		{ name: "@orlalabs/kovar", version: "0.5.0" },
		{ capabilities: { tools: {} } },
	);
	registerTools(server, store);
	return server;
}
