import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
	appendEventsSchema,
	assertCostUnderSchema,
	assertLatencyUnderSchema,
	assertMessagesMatchSchema,
	assertNoDriftSchema,
	assertNoLoopsSchema,
	assertTokenBudgetPerStepSchema,
	assertToolCalledSchema,
	assertToolOrderSchema,
	diffRunsSchema,
	getRunSchema,
	listRunsSchema,
	recordCanonicalSchema,
	recordRunSchema,
	replayRunSchema,
} from "./schema.js";
import type { EventInput, MessageInput, Store } from "./store.js";
import type { DriftDiffEntry, DriftReport, RunStatus, ToolCallEvent } from "./types.js";
import { readPackageVersion, validateInput } from "./validate.js";

export type McpErrorCode =
	| "INVALID_INPUT"
	| "RUN_NOT_FOUND"
	| "RUN_DUPLICATE"
	| "CANONICAL_NOT_FOUND"
	| "CANONICAL_EXISTS"
	| "SEQUENCE_MISMATCH"
	| "INTERNAL";

export class McpToolError extends Error {
	readonly code: McpErrorCode;
	readonly hint?: string;
	readonly errors?: { path: string; message: string }[];

	constructor(
		code: McpErrorCode,
		message: string,
		options: {
			hint?: string;
			errors?: { path: string; message: string }[];
		} = {},
	) {
		super(message);
		this.name = "McpToolError";
		this.code = code;
		if (options.hint !== undefined) this.hint = options.hint;
		if (options.errors !== undefined) this.errors = options.errors;
	}
}

export const TOOL_DEFS = [
	{
		name: "record_run",
		description:
			"Create a new run with its tool-call events and (optional) messages. Errors with RUN_DUPLICATE if the run_id already exists. Use 'append_events' to add more events to an existing run.",
		inputSchema: recordRunSchema,
	},
	{
		name: "append_events",
		description:
			"Append events (and optionally messages) to an existing run created with 'record_run'. Optionally update the run status (e.g., from 'running' to 'completed').",
		inputSchema: appendEventsSchema,
	},
	{
		name: "assert_tool_called",
		description:
			"Assert a tool was invoked in the run. If 'count' is given, requires exact count; otherwise requires >= 1. If 'args' is given, only events whose args contain those key/value pairs match.",
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
		name: "assert_no_loops",
		description:
			"Assert the run does not contain repeated tool patterns. A loop is an n-gram of length 1..window that appears 'max_repeat' or more times consecutively. If 'tool_name' is given, only counts consecutive occurrences of that single tool. Defaults: max_repeat=3, window=5.",
		inputSchema: assertNoLoopsSchema,
	},
	{
		name: "assert_token_budget_per_step",
		description:
			"Assert no single event exceeded a token budget (sum of tokens_in + tokens_out). Null token values are treated as 0. Filter by 'tool_name' to limit which events are checked.",
		inputSchema: assertTokenBudgetPerStepSchema,
	},
	{
		name: "assert_messages_match",
		description:
			"Assert the run's recorded messages satisfy a list of constraints. Each expected entry may specify role/contains/equals/matches (matches is a regex). 'strict' requires equal length and index alignment; default false allows extra trailing actual messages.",
		inputSchema: assertMessagesMatchSchema,
	},
	{
		name: "assert_tool_order",
		description:
			"Assert a sequence of tool names appears in the run, either in-order (default) or contiguously (contiguous=true). Returns matched_indices and the first missing index, if any.",
		inputSchema: assertToolOrderSchema,
	},
	{
		name: "assert_latency_under",
		description:
			"Assert the run's total wall-time and/or per-event latency is below a threshold (ms). At least one of max_total_ms or max_per_event_ms must be supplied. Returns the top 5 slowest events.",
		inputSchema: assertLatencyUnderSchema,
	},
	{
		name: "diff_runs",
		description:
			"Compute a structured diff between two runs: tool sequence diff, total cost delta, total latency delta, and per-seq argument key diff (added/removed/changed top-level keys).",
		inputSchema: diffRunsSchema,
	},
	{
		name: "replay_run",
		description:
			"Return the recorded events for a run, optionally starting from a given seq (from_seq; from_event_id is deprecated, kept for back-compat). 'substitute' maps tool_name -> canned result; matching events have their result replaced (each event gets a deep clone).",
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

interface RawEventInput {
	tool_name: string;
	args?: Record<string, unknown>;
	result?: unknown;
	cost_usd?: number;
	tokens_in?: number;
	tokens_out?: number;
	timestamp: number;
}

interface RawMessageInput {
	role: string;
	content: string;
	tokens?: number;
	timestamp: number;
}

interface RecordRunArgs {
	agent_id: string;
	run_id: string;
	metadata?: Record<string, unknown>;
	events?: RawEventInput[];
	messages?: RawMessageInput[];
	status?: RunStatus;
}

interface AppendEventsArgs {
	run_id: string;
	events: RawEventInput[];
	messages?: RawMessageInput[];
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

interface AssertNoLoopsArgs {
	run_id: string;
	max_repeat?: number;
	window?: number;
	tool_name?: string;
}

interface AssertTokenBudgetPerStepArgs {
	run_id: string;
	max_tokens_per_event: number;
	tool_name?: string;
}

interface MessageConstraint {
	role?: string;
	contains?: string;
	equals?: string;
	matches?: string;
}

interface AssertMessagesMatchArgs {
	run_id: string;
	expected: MessageConstraint[];
	strict?: boolean;
}

interface AssertToolOrderArgs {
	run_id: string;
	sequence: string[];
	contiguous?: boolean;
}

interface AssertLatencyUnderArgs {
	run_id: string;
	max_total_ms?: number;
	max_per_event_ms?: number;
	tool_name?: string;
}

interface DiffRunsArgs {
	run_id_a: string;
	run_id_b: string;
}

interface ReplayRunArgs {
	run_id: string;
	from_seq?: number;
	from_event_id?: number;
	substitute?: Record<string, unknown>;
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
		tokens_in: e.tokensIn,
		tokens_out: e.tokensOut,
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

function deepClone<T>(value: T): T {
	if (value === null || value === undefined) return value;
	if (typeof value !== "object") return value;
	return JSON.parse(JSON.stringify(value)) as T;
}

function isSubset(subset: Record<string, unknown>, full: Record<string, unknown>): boolean {
	for (const [k, v] of Object.entries(subset)) {
		if (!(k in full)) return false;
		if (!deepEqual(v, full[k])) return false;
	}
	return true;
}

export function computeDrift(expected: string[], actual: string[]): DriftReport {
	const len = Math.max(expected.length, actual.length);
	const diff: DriftDiffEntry[] = [];
	for (let i = 0; i < len; i++) {
		const e = i < expected.length ? expected[i] : null;
		const a = i < actual.length ? actual[i] : null;
		if (e !== a) diff.push({ index: i, expected: e ?? null, actual: a ?? null });
	}
	return { matched: diff.length === 0, expected, actual, diff };
}

function requireRun(store: Store, runId: string): void {
	if (!store.getRun(runId)) {
		throw new McpToolError("RUN_NOT_FOUND", `Run '${runId}' not found`, {
			hint: "Call 'record_run' first or use 'list_runs' to find existing run_ids.",
		});
	}
}

function toEventInputs(events: RawEventInput[]): EventInput[] {
	return events.map((e) => ({
		toolName: e.tool_name,
		args: e.args ?? {},
		result: e.result === undefined ? null : e.result,
		costUsd: e.cost_usd ?? null,
		tokensIn: e.tokens_in ?? null,
		tokensOut: e.tokens_out ?? null,
		timestamp: e.timestamp,
	}));
}

function toMessageInputs(messages: RawMessageInput[]): MessageInput[] {
	return messages.map((m) => ({
		role: m.role,
		content: m.content,
		tokens: m.tokens ?? null,
		timestamp: m.timestamp,
	}));
}

type Loop = { tool_names: string[]; start_seq: number; length: number; repeats: number };

function detectFilteredLoops(tools: string[], maxRepeat: number, toolFilter: string): Loop[] {
	const found: Loop[] = [];
	let i = 0;
	while (i < tools.length) {
		if (tools[i] !== toolFilter) {
			i++;
			continue;
		}
		let j = i;
		while (j < tools.length && tools[j] === toolFilter) j++;
		const run = j - i;
		if (run >= maxRepeat) {
			found.push({ tool_names: [toolFilter], start_seq: i, length: 1, repeats: run });
		}
		i = j;
	}
	return found;
}

function countNgramRepeats(tools: string[], start: number, n: number): number {
	let repeats = 1;
	let k = start + n;
	while (k + n <= tools.length) {
		let match = true;
		for (let idx = 0; idx < n; idx++) {
			if (tools[k + idx] !== tools[start + idx]) {
				match = false;
				break;
			}
		}
		if (!match) break;
		repeats++;
		k += n;
	}
	return repeats;
}

function detectLoops(
	tools: string[],
	maxRepeat: number,
	window: number,
	toolFilter: string | undefined,
): Loop[] {
	if (toolFilter !== undefined) return detectFilteredLoops(tools, maxRepeat, toolFilter);
	const found: Loop[] = [];
	const used = new Set<number>();
	for (let n = 1; n <= window; n++) {
		for (let i = 0; i + n * maxRepeat <= tools.length; i++) {
			if (used.has(i)) continue;
			const repeats = countNgramRepeats(tools, i, n);
			if (repeats >= maxRepeat) {
				found.push({
					tool_names: tools.slice(i, i + n),
					start_seq: i,
					length: n,
					repeats,
				});
				for (let m = i; m < i + n * repeats; m++) used.add(m);
			}
		}
	}

	return found;
}

function compileMatchesRegex(index: number, source: string): RegExp {
	try {
		return new RegExp(source);
	} catch (err) {
		throw new McpToolError(
			"INVALID_INPUT",
			`Invalid regex at expected[${index}].matches: ${err instanceof Error ? err.message : String(err)}`,
			{
				errors: [
					{ path: `expected[${index}].matches`, message: "is not a valid regular expression" },
				],
			},
		);
	}
}

function compareMessage(
	index: number,
	expected: MessageConstraint,
	actual: { role: string; content: string } | null,
): { index: number; expected: object; actual: object | null; reason: string } | null {
	if (!actual) {
		return { index, expected, actual: null, reason: "missing actual message at index" };
	}
	const reasons: string[] = [];
	if (expected.role !== undefined && actual.role !== expected.role) {
		reasons.push(`role: expected "${expected.role}", got "${actual.role}"`);
	}
	if (expected.contains !== undefined && !actual.content.includes(expected.contains)) {
		reasons.push(`contains: actual content does not include "${expected.contains}"`);
	}
	if (expected.equals !== undefined && actual.content !== expected.equals) {
		reasons.push("equals: actual content does not exactly match");
	}
	if (expected.matches !== undefined) {
		const re = compileMatchesRegex(index, expected.matches);
		if (!re.test(actual.content)) {
			reasons.push(`matches: actual content does not match /${expected.matches}/`);
		}
	}
	if (reasons.length === 0) return null;
	return {
		index,
		expected,
		actual: { role: actual.role, content: actual.content },
		reason: reasons.join("; "),
	};
}

export const HANDLERS: Record<ToolName, ToolHandler> = {
	record_run: (store, raw) => {
		const args = raw as unknown as RecordRunArgs;
		if (store.getRun(args.run_id)) {
			throw new McpToolError("RUN_DUPLICATE", `Run '${args.run_id}' already exists`, {
				hint: "Use 'append_events' to extend an existing run, or pick a different run_id.",
			});
		}
		const events = args.events ?? [];
		const messages = args.messages ?? [];
		const startedAt = events[0]?.timestamp ?? Date.now();
		const endedAt = events[events.length - 1]?.timestamp ?? startedAt;
		const status: RunStatus = args.status ?? "completed";
		const eventInputs = toEventInputs(events);
		let stored: ToolCallEvent[];
		try {
			stored = store.createRunWithEvents(
				{
					id: args.run_id,
					agentId: args.agent_id,
					status,
					startedAt,
					endedAt,
					metadata: args.metadata ?? {},
				},
				eventInputs,
			);
		} catch (error) {
			throw new McpToolError("INTERNAL", error instanceof Error ? error.message : String(error));
		}
		let messageCount = 0;
		if (messages.length > 0) {
			const inserted = store.appendMessages(args.run_id, toMessageInputs(messages));
			messageCount = inserted.length;
		}
		return {
			run_id: args.run_id,
			event_count: stored.length,
			message_count: messageCount,
			status,
		};
	},

	append_events: (store, raw) => {
		const args = raw as unknown as AppendEventsArgs;
		requireRun(store, args.run_id);
		const eventInputs = toEventInputs(args.events ?? []);
		const inserted = store.appendEvents(args.run_id, eventInputs);
		let messageCount = 0;
		if (args.messages && args.messages.length > 0) {
			const m = store.appendMessages(args.run_id, toMessageInputs(args.messages));
			messageCount = m.length;
		}
		if (args.status) {
			const endedAt = args.status === "running" ? undefined : Date.now();
			store.updateRunStatus(args.run_id, args.status, endedAt);
		}
		const total = store.getEvents(args.run_id).length;
		return {
			run_id: args.run_id,
			appended_event_count: inserted.length,
			appended_message_count: messageCount,
			total_event_count: total,
		};
	},

	assert_tool_called: (store, raw) => {
		const args = raw as unknown as AssertToolCalledArgs;
		requireRun(store, args.run_id);
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
		requireRun(store, args.run_id);
		const canonical = store.getCanonical(args.canonical_name);
		if (!canonical) {
			throw new McpToolError(
				"CANONICAL_NOT_FOUND",
				`Canonical '${args.canonical_name}' not found`,
				{ hint: "Use 'record_canonical' to create one." },
			);
		}
		const actual = store.getEvents(args.run_id).map((e) => e.toolName);
		const report = computeDrift(canonical.toolSequence, actual);
		return { passed: report.matched, ...report, canonical_name: args.canonical_name };
	},

	assert_cost_under: (store, raw) => {
		const args = raw as unknown as AssertCostUnderArgs;
		requireRun(store, args.run_id);
		const events = store.getEvents(args.run_id);
		const total = events.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
		return { passed: total < args.usd, total_cost_usd: total, threshold_usd: args.usd };
	},

	assert_no_loops: (store, raw) => {
		const args = raw as unknown as AssertNoLoopsArgs;
		requireRun(store, args.run_id);
		const maxRepeat = args.max_repeat ?? 3;
		const window = args.window ?? 5;
		const tools = store.getEvents(args.run_id).map((e) => e.toolName);
		const loops = detectLoops(tools, maxRepeat, window, args.tool_name);
		return { passed: loops.length === 0, loops };
	},

	assert_token_budget_per_step: (store, raw) => {
		const args = raw as unknown as AssertTokenBudgetPerStepArgs;
		requireRun(store, args.run_id);
		const events = store.getEvents(args.run_id);
		const violations: {
			seq: number;
			tool_name: string;
			tokens_in: number | null;
			tokens_out: number | null;
			total: number;
		}[] = [];
		for (const e of events) {
			if (args.tool_name !== undefined && e.toolName !== args.tool_name) continue;
			const total = (e.tokensIn ?? 0) + (e.tokensOut ?? 0);
			if (total > args.max_tokens_per_event) {
				violations.push({
					seq: e.seq,
					tool_name: e.toolName,
					tokens_in: e.tokensIn,
					tokens_out: e.tokensOut,
					total,
				});
			}
		}
		return {
			passed: violations.length === 0,
			max_tokens_per_event: args.max_tokens_per_event,
			violations,
		};
	},

	assert_messages_match: (store, raw) => {
		const args = raw as unknown as AssertMessagesMatchArgs;
		requireRun(store, args.run_id);
		const messages = store.getMessages(args.run_id);
		const strict = args.strict ?? false;

		if (strict && messages.length !== args.expected.length) {
			return {
				passed: false,
				diff: [
					{
						index: -1,
						expected: { count: args.expected.length },
						actual: { count: messages.length },
						reason: `strict: expected ${args.expected.length} messages, got ${messages.length}`,
					},
				],
			};
		}

		const diff: { index: number; expected: object; actual: object | null; reason: string }[] = [];
		for (let i = 0; i < args.expected.length; i++) {
			const expected = args.expected[i];
			if (!expected) continue;
			const actual = messages[i];
			const entry = compareMessage(i, expected, actual ?? null);
			if (entry) diff.push(entry);
		}
		return { passed: diff.length === 0, diff };
	},

	assert_tool_order: (store, raw) => {
		const args = raw as unknown as AssertToolOrderArgs;
		requireRun(store, args.run_id);
		const tools = store.getEvents(args.run_id).map((e) => e.toolName);
		const matched: number[] = [];
		const contiguous = args.contiguous ?? false;

		if (contiguous) {
			outer: for (let start = 0; start <= tools.length - args.sequence.length; start++) {
				for (let i = 0; i < args.sequence.length; i++) {
					if (tools[start + i] !== args.sequence[i]) continue outer;
				}
				for (let i = 0; i < args.sequence.length; i++) matched.push(start + i);
				break;
			}
			if (matched.length === args.sequence.length) {
				return { passed: true, matched_indices: matched, missing_at: null };
			}
			return { passed: false, matched_indices: [], missing_at: matched.length };
		}

		let cursor = 0;
		for (let i = 0; i < args.sequence.length; i++) {
			let found = -1;
			for (let j = cursor; j < tools.length; j++) {
				if (tools[j] === args.sequence[i]) {
					found = j;
					break;
				}
			}
			if (found === -1) {
				return { passed: false, matched_indices: matched, missing_at: i };
			}
			matched.push(found);
			cursor = found + 1;
		}
		return { passed: true, matched_indices: matched, missing_at: null };
	},

	assert_latency_under: (store, raw) => {
		const args = raw as unknown as AssertLatencyUnderArgs;
		requireRun(store, args.run_id);
		if (args.max_total_ms === undefined && args.max_per_event_ms === undefined) {
			throw new McpToolError(
				"INVALID_INPUT",
				"At least one of 'max_total_ms' or 'max_per_event_ms' is required",
				{
					errors: [{ path: "max_total_ms|max_per_event_ms", message: "at least one is required" }],
				},
			);
		}
		const events = store.getEvents(args.run_id);
		const totalMs =
			events.length === 0
				? 0
				: (events[events.length - 1]?.timestamp ?? 0) - (events[0]?.timestamp ?? 0);

		const perEvent: { seq: number; tool_name: string; duration_ms: number }[] = [];
		for (let i = 0; i < events.length; i++) {
			const e = events[i];
			if (!e) continue;
			const next = events[i + 1];
			const duration = next ? next.timestamp - e.timestamp : 0;
			perEvent.push({ seq: e.seq, tool_name: e.toolName, duration_ms: duration });
		}

		let perEventViolation = false;
		if (args.max_per_event_ms !== undefined) {
			for (const p of perEvent) {
				if (args.tool_name !== undefined && p.tool_name !== args.tool_name) continue;
				if (p.duration_ms > args.max_per_event_ms) {
					perEventViolation = true;
					break;
				}
			}
		}

		const totalViolation = args.max_total_ms !== undefined ? totalMs > args.max_total_ms : false;

		const slowest = [...perEvent].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 5);

		return {
			passed: !totalViolation && !perEventViolation,
			total_ms: totalMs,
			max_total_ms: args.max_total_ms ?? null,
			max_per_event_ms: args.max_per_event_ms ?? null,
			slowest,
		};
	},

	diff_runs: (store, raw) => {
		const args = raw as unknown as DiffRunsArgs;
		requireRun(store, args.run_id_a);
		requireRun(store, args.run_id_b);
		const eventsA = store.getEvents(args.run_id_a);
		const eventsB = store.getEvents(args.run_id_b);
		const seqA = eventsA.map((e) => e.toolName);
		const seqB = eventsB.map((e) => e.toolName);
		const drift = computeDrift(seqA, seqB);
		const tool_diff = drift.diff.map((d) => ({ index: d.index, a: d.expected, b: d.actual }));

		const costA = eventsA.reduce((s, e) => s + (e.costUsd ?? 0), 0);
		const costB = eventsB.reduce((s, e) => s + (e.costUsd ?? 0), 0);

		const latA =
			eventsA.length === 0
				? 0
				: (eventsA[eventsA.length - 1]?.timestamp ?? 0) - (eventsA[0]?.timestamp ?? 0);
		const latB =
			eventsB.length === 0
				? 0
				: (eventsB[eventsB.length - 1]?.timestamp ?? 0) - (eventsB[0]?.timestamp ?? 0);

		const args_diff: {
			seq: number;
			tool_name: string;
			added: string[];
			removed: string[];
			changed: string[];
		}[] = [];
		const minLen = Math.min(eventsA.length, eventsB.length);
		for (let i = 0; i < minLen; i++) {
			const a = eventsA[i];
			const b = eventsB[i];
			if (!a || !b) continue;
			if (a.toolName !== b.toolName) continue;
			const ka = Object.keys(a.args);
			const kb = Object.keys(b.args);
			const added = kb.filter((k) => !ka.includes(k));
			const removed = ka.filter((k) => !kb.includes(k));
			const changed = ka.filter((k) => kb.includes(k) && !deepEqual(a.args[k], b.args[k]));
			if (added.length > 0 || removed.length > 0 || changed.length > 0) {
				args_diff.push({ seq: a.seq, tool_name: a.toolName, added, removed, changed });
			}
		}

		return {
			tool_diff,
			cost_a_usd: costA,
			cost_b_usd: costB,
			cost_delta_usd: costB - costA,
			latency_a_ms: latA,
			latency_b_ms: latB,
			latency_delta_ms: latB - latA,
			args_diff,
		};
	},

	replay_run: (store, raw) => {
		const args = raw as unknown as ReplayRunArgs;
		requireRun(store, args.run_id);
		const fromSeq = args.from_seq ?? args.from_event_id ?? 0;
		const events = store.getEvents(args.run_id, fromSeq);
		const wire = events.map((e) => {
			const w = eventToWire(e);
			if (args.substitute && Object.hasOwn(args.substitute, e.toolName)) {
				return { ...w, result: deepClone(args.substitute[e.toolName]) };
			}
			return w;
		});
		return { run_id: args.run_id, events: wire };
	},

	record_canonical: (store, raw) => {
		const args = raw as unknown as RecordCanonicalArgs;
		const sequences = args.run_ids.map((id) => {
			if (!store.getRun(id)) {
				throw new McpToolError("RUN_NOT_FOUND", `Run '${id}' not found`);
			}
			return store.getEvents(id).map((e) => e.toolName);
		});
		const reference = sequences[0];
		if (!reference) {
			throw new McpToolError("INVALID_INPUT", "No runs provided");
		}
		for (let i = 1; i < sequences.length; i++) {
			const seq = sequences[i];
			if (!seq) continue;
			const matches = seq.length === reference.length && seq.every((t, j) => t === reference[j]);
			if (!matches) {
				throw new McpToolError(
					"SEQUENCE_MISMATCH",
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
		if (!run) {
			throw new McpToolError("RUN_NOT_FOUND", `Run '${args.run_id}' not found`);
		}
		const events = store.getEvents(args.run_id);
		return { run, events: events.map(eventToWire) };
	},

	list_runs: (store, raw) => {
		const args = raw as unknown as ListRunsArgs;
		const runs = store.listRuns(args.agent_id);
		return { runs };
	},
};

function errorToJson(err: McpToolError): string {
	const payload: Record<string, unknown> = {
		code: err.code,
		message: err.message,
	};
	if (err.errors !== undefined) payload.errors = err.errors;
	if (err.hint !== undefined) payload.hint = err.hint;
	return JSON.stringify(payload);
}

export function registerTools(server: Server, store: Store): void {
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: TOOL_DEFS.map((t) => ({ ...t })),
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const name = request.params.name as ToolName;
		const def = TOOL_DEFS.find((t) => t.name === name);
		const handler = HANDLERS[name];
		if (!def || !handler) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: errorToJson(
							new McpToolError("INVALID_INPUT", `Unknown tool: ${request.params.name}`),
						),
					},
				],
			};
		}
		const args = (request.params.arguments ?? {}) as Record<string, unknown>;
		const validation = validateInput(def.inputSchema, args);
		if (!validation.ok) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: errorToJson(
							new McpToolError("INVALID_INPUT", "Input validation failed", {
								errors: validation.errors,
								hint: "Check the tool's inputSchema for required fields and types.",
							}),
						),
					},
				],
			};
		}
		try {
			const result = await handler(store, args);
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		} catch (error) {
			if (error instanceof McpToolError) {
				return {
					isError: true,
					content: [{ type: "text", text: errorToJson(error) }],
				};
			}
			const message = error instanceof Error ? error.message : String(error);
			return {
				isError: true,
				content: [{ type: "text", text: errorToJson(new McpToolError("INTERNAL", message)) }],
			};
		}
	});
}

export function createMcpServer(store: Store): Server {
	const server = new Server(
		{ name: "@orlalabs/kovar", version: readPackageVersion() },
		{ capabilities: { tools: {} } },
	);
	registerTools(server, store);
	return server;
}
