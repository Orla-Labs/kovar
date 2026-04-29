import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../../../src/mcp/store.js";
import { HANDLERS, McpToolError } from "../../../src/mcp/tools.js";

function call<T>(name: keyof typeof HANDLERS, store: Store, args: Record<string, unknown>): T {
	return HANDLERS[name](store, args) as T;
}

describe("tool handlers", () => {
	let store: Store;

	beforeEach(() => {
		store = new Store({ dbPath: ":memory:" });
	});

	describe("record_run", () => {
		it("records a run with events and returns event_count", () => {
			const result = call<{ run_id: string; event_count: number; status: string }>(
				"record_run",
				store,
				{
					agent_id: "agent-1",
					run_id: "r1",
					metadata: { task: "demo" },
					events: [
						{ tool_name: "Read", args: { path: "/a" }, timestamp: 100, cost_usd: 0.01 },
						{ tool_name: "Edit", args: { path: "/a" }, timestamp: 200, cost_usd: 0.02 },
					],
				},
			);
			expect(result.event_count).toBe(2);
			expect(result.status).toBe("completed");
			expect(store.getEvents("r1")).toHaveLength(2);
			expect(store.getRun("r1")?.metadata).toEqual({ task: "demo" });
		});

		it("rejects duplicate run_id with RUN_DUPLICATE", () => {
			call("record_run", store, { agent_id: "a", run_id: "r1" });
			try {
				call("record_run", store, { agent_id: "a", run_id: "r1" });
				expect.fail("expected throw");
			} catch (err) {
				expect(err).toBeInstanceOf(McpToolError);
				expect((err as McpToolError).code).toBe("RUN_DUPLICATE");
				expect((err as McpToolError).hint).toBeDefined();
			}
		});

		it("defaults metadata, events, and status when omitted", () => {
			const result = call<{ status: string; event_count: number }>("record_run", store, {
				agent_id: "a",
				run_id: "r1",
			});
			expect(result.status).toBe("completed");
			expect(result.event_count).toBe(0);
			expect(store.getRun("r1")?.metadata).toEqual({});
		});

		it("accepts status=running so the run can be extended later", () => {
			const result = call<{ status: string }>("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				status: "running",
			});
			expect(result.status).toBe("running");
			expect(store.getRun("r1")?.status).toBe("running");
		});

		it("persists messages alongside events", () => {
			const r = call<{ message_count: number; event_count: number }>("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [{ tool_name: "Read", timestamp: 1 }],
				messages: [
					{ role: "user", content: "hi", timestamp: 0 },
					{ role: "assistant", content: "hello", tokens: 10, timestamp: 2 },
				],
			});
			expect(r.message_count).toBe(2);
			expect(r.event_count).toBe(1);
			const stored = store.getMessages("r1");
			expect(stored.map((m) => m.role)).toEqual(["user", "assistant"]);
			expect(stored[1]?.tokens).toBe(10);
		});

		it("persists tokens_in/tokens_out per event (snake -> camel)", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "Llm", timestamp: 1, tokens_in: 100, tokens_out: 50 },
					{ tool_name: "Llm", timestamp: 2, tokens_in: 200, tokens_out: 0 },
				],
			});
			const events = store.getEvents("r1");
			expect(events[0]?.tokensIn).toBe(100);
			expect(events[0]?.tokensOut).toBe(50);
			expect(events[1]?.tokensIn).toBe(200);
			expect(events[1]?.tokensOut).toBe(0);
		});

		it("is atomic: when an event insert fails, the run row is not created", () => {
			let threw = false;
			try {
				call("record_run", store, {
					agent_id: "a",
					run_id: "atomic-fail",
					events: [
						{ tool_name: "OK", timestamp: 1 },
						// biome-ignore lint/suspicious/noExplicitAny: forcing NOT NULL violation for atomicity test
						{ tool_name: null as any, timestamp: 2 },
					],
				});
			} catch {
				threw = true;
			}
			expect(threw).toBe(true);
			expect(store.getRun("atomic-fail")).toBeNull();
		});
	});

	describe("append_events", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				status: "running",
				events: [{ tool_name: "Read", timestamp: 1 }],
			});
		});

		it("appends events to an existing run", () => {
			const r = call<{
				appended_event_count: number;
				appended_message_count: number;
				total_event_count: number;
			}>("append_events", store, {
				run_id: "r1",
				events: [
					{ tool_name: "Edit", timestamp: 2 },
					{ tool_name: "Bash", timestamp: 3 },
				],
			});
			expect(r.appended_event_count).toBe(2);
			expect(r.appended_message_count).toBe(0);
			expect(r.total_event_count).toBe(3);
			const tools = store.getEvents("r1").map((e) => e.toolName);
			expect(tools).toEqual(["Read", "Edit", "Bash"]);
		});

		it("appends messages and updates status", () => {
			const r = call<{ appended_message_count: number }>("append_events", store, {
				run_id: "r1",
				events: [],
				messages: [{ role: "user", content: "more", timestamp: 5 }],
				status: "completed",
			});
			expect(r.appended_message_count).toBe(1);
			expect(store.getRun("r1")?.status).toBe("completed");
			expect(store.getRun("r1")?.endedAt).not.toBeNull();
		});

		it("status=running keeps endedAt null", () => {
			call("append_events", store, {
				run_id: "r1",
				events: [],
				status: "running",
			});
			expect(store.getRun("r1")?.endedAt).toBeNull();
		});

		it("throws RUN_NOT_FOUND for missing run", () => {
			try {
				call("append_events", store, { run_id: "nope", events: [] });
				expect.fail("expected throw");
			} catch (err) {
				expect((err as McpToolError).code).toBe("RUN_NOT_FOUND");
			}
		});
	});

	describe("assert_tool_called", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "Read", args: { path: "/a" }, timestamp: 1 },
					{ tool_name: "Read", args: { path: "/b" }, timestamp: 2 },
					{ tool_name: "Edit", args: { path: "/a", new: "x" }, timestamp: 3 },
				],
			});
		});

		it("passes when tool was called at least once", () => {
			const r = call<{ passed: boolean; actual_count: number }>("assert_tool_called", store, {
				run_id: "r1",
				tool_name: "Read",
			});
			expect(r.passed).toBe(true);
			expect(r.actual_count).toBe(2);
		});

		it("fails when expected count differs", () => {
			const r = call<{ passed: boolean }>("assert_tool_called", store, {
				run_id: "r1",
				tool_name: "Read",
				count: 3,
			});
			expect(r.passed).toBe(false);
		});

		it("matches on args subset", () => {
			const r = call<{ actual_count: number }>("assert_tool_called", store, {
				run_id: "r1",
				tool_name: "Read",
				args: { path: "/a" },
			});
			expect(r.actual_count).toBe(1);
		});

		it("fails when tool not called at all", () => {
			const r = call<{ passed: boolean }>("assert_tool_called", store, {
				run_id: "r1",
				tool_name: "Bash",
			});
			expect(r.passed).toBe(false);
		});

		it("throws RUN_NOT_FOUND when run does not exist", () => {
			try {
				call("assert_tool_called", store, { run_id: "missing", tool_name: "Read" });
				expect.fail("expected throw");
			} catch (err) {
				expect((err as McpToolError).code).toBe("RUN_NOT_FOUND");
			}
		});
	});

	describe("assert_cost_under", () => {
		it("sums event costs and compares against threshold", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "A", timestamp: 1, cost_usd: 0.1 },
					{ tool_name: "B", timestamp: 2, cost_usd: 0.25 },
				],
			});
			const under = call<{ passed: boolean; total_cost_usd: number }>("assert_cost_under", store, {
				run_id: "r1",
				usd: 0.5,
			});
			expect(under.passed).toBe(true);
			expect(under.total_cost_usd).toBeCloseTo(0.35);

			const over = call<{ passed: boolean }>("assert_cost_under", store, {
				run_id: "r1",
				usd: 0.2,
			});
			expect(over.passed).toBe(false);
		});

		it("treats null cost_usd as zero", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [{ tool_name: "A", timestamp: 1 }],
			});
			const r = call<{ total_cost_usd: number }>("assert_cost_under", store, {
				run_id: "r1",
				usd: 1,
			});
			expect(r.total_cost_usd).toBe(0);
		});
	});

	describe("assert_no_loops", () => {
		it("detects repeated single-tool spam", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "A", timestamp: 1 },
					{ tool_name: "A", timestamp: 2 },
					{ tool_name: "A", timestamp: 3 },
					{ tool_name: "B", timestamp: 4 },
				],
			});
			const r = call<{
				passed: boolean;
				loops: { tool_names: string[]; repeats: number; start_seq: number }[];
			}>("assert_no_loops", store, { run_id: "r1" });
			expect(r.passed).toBe(false);
			expect(r.loops[0]?.tool_names).toEqual(["A"]);
			expect(r.loops[0]?.repeats).toBeGreaterThanOrEqual(3);
		});

		it("detects an n-gram loop with window 2 max_repeat 3", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "A", timestamp: 1 },
					{ tool_name: "B", timestamp: 2 },
					{ tool_name: "A", timestamp: 3 },
					{ tool_name: "B", timestamp: 4 },
					{ tool_name: "A", timestamp: 5 },
					{ tool_name: "B", timestamp: 6 },
				],
			});
			const r = call<{
				passed: boolean;
				loops: { tool_names: string[]; repeats: number; length: number }[];
			}>("assert_no_loops", store, { run_id: "r1", max_repeat: 3, window: 2 });
			expect(r.passed).toBe(false);
			const ab = r.loops.find((l) => l.length === 2);
			expect(ab?.tool_names).toEqual(["A", "B"]);
			expect(ab?.repeats).toBe(3);
		});

		it("respects tool_name filter (only counts that tool)", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "A", timestamp: 1 },
					{ tool_name: "A", timestamp: 2 },
					{ tool_name: "A", timestamp: 3 },
					{ tool_name: "B", timestamp: 4 },
					{ tool_name: "B", timestamp: 5 },
				],
			});
			const r = call<{ loops: { tool_names: string[] }[] }>("assert_no_loops", store, {
				run_id: "r1",
				max_repeat: 3,
				tool_name: "B",
			});
			expect(r.loops).toHaveLength(0);
			const r2 = call<{ loops: { tool_names: string[] }[] }>("assert_no_loops", store, {
				run_id: "r1",
				max_repeat: 3,
				tool_name: "A",
			});
			expect(r2.loops).toHaveLength(1);
		});

		it("does not flag legitimate repetition under threshold", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "A", timestamp: 1 },
					{ tool_name: "A", timestamp: 2 },
					{ tool_name: "B", timestamp: 3 },
				],
			});
			const r = call<{ passed: boolean; loops: unknown[] }>("assert_no_loops", store, {
				run_id: "r1",
				max_repeat: 3,
			});
			expect(r.passed).toBe(true);
			expect(r.loops).toEqual([]);
		});
	});

	describe("assert_token_budget_per_step", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "Llm", timestamp: 1, tokens_in: 100, tokens_out: 200 },
					{ tool_name: "Llm", timestamp: 2, tokens_in: 5000, tokens_out: 5000 },
					{ tool_name: "Read", timestamp: 3 },
				],
			});
		});

		it("flags events exceeding the budget", () => {
			const r = call<{
				passed: boolean;
				violations: { seq: number; total: number }[];
			}>("assert_token_budget_per_step", store, {
				run_id: "r1",
				max_tokens_per_event: 1000,
			});
			expect(r.passed).toBe(false);
			expect(r.violations).toHaveLength(1);
			expect(r.violations[0]?.seq).toBe(1);
			expect(r.violations[0]?.total).toBe(10000);
		});

		it("passes when all events under budget", () => {
			const r = call<{ passed: boolean }>("assert_token_budget_per_step", store, {
				run_id: "r1",
				max_tokens_per_event: 100000,
			});
			expect(r.passed).toBe(true);
		});

		it("filters by tool_name", () => {
			const r = call<{ violations: unknown[] }>("assert_token_budget_per_step", store, {
				run_id: "r1",
				max_tokens_per_event: 1000,
				tool_name: "Read",
			});
			expect(r.violations).toHaveLength(0);
		});
	});

	describe("assert_messages_match", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [],
				messages: [
					{ role: "user", content: "Hello world", timestamp: 1 },
					{ role: "assistant", content: "Hi there friend", timestamp: 2 },
					{ role: "user", content: "thanks", timestamp: 3 },
				],
			});
		});

		it("passes when role+contains constraints all match", () => {
			const r = call<{ passed: boolean }>("assert_messages_match", store, {
				run_id: "r1",
				expected: [
					{ role: "user", contains: "Hello" },
					{ role: "assistant", contains: "friend" },
				],
			});
			expect(r.passed).toBe(true);
		});

		it("fails on role mismatch", () => {
			const r = call<{
				passed: boolean;
				diff: { reason: string }[];
			}>("assert_messages_match", store, {
				run_id: "r1",
				expected: [{ role: "assistant" }],
			});
			expect(r.passed).toBe(false);
			expect(r.diff[0]?.reason).toMatch(/role/);
		});

		it("supports equals constraint", () => {
			const r = call<{ passed: boolean }>("assert_messages_match", store, {
				run_id: "r1",
				expected: [{ equals: "Hello world" }],
			});
			expect(r.passed).toBe(true);
		});

		it("supports matches regex constraint", () => {
			const r = call<{ passed: boolean }>("assert_messages_match", store, {
				run_id: "r1",
				expected: [{ matches: "^Hello\\s+world$" }],
			});
			expect(r.passed).toBe(true);
		});

		it("non-strict allows extra trailing actual messages", () => {
			const r = call<{ passed: boolean }>("assert_messages_match", store, {
				run_id: "r1",
				expected: [{ role: "user" }],
			});
			expect(r.passed).toBe(true);
		});

		it("strict requires exact length", () => {
			const r = call<{ passed: boolean; diff: { reason: string }[] }>(
				"assert_messages_match",
				store,
				{
					run_id: "r1",
					expected: [{ role: "user" }],
					strict: true,
				},
			);
			expect(r.passed).toBe(false);
			expect(r.diff[0]?.reason).toMatch(/strict/);
		});

		it("INVALID_INPUT for bad regex", () => {
			try {
				call("assert_messages_match", store, {
					run_id: "r1",
					expected: [{ matches: "[unterminated" }],
				});
				expect.fail("expected throw");
			} catch (err) {
				expect((err as McpToolError).code).toBe("INVALID_INPUT");
			}
		});
	});

	describe("assert_tool_order", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "Read", timestamp: 1 },
					{ tool_name: "Edit", timestamp: 2 },
					{ tool_name: "Bash", timestamp: 3 },
					{ tool_name: "Read", timestamp: 4 },
				],
			});
		});

		it("non-contiguous: matches subsequence in order", () => {
			const r = call<{ passed: boolean; matched_indices: number[]; missing_at: number | null }>(
				"assert_tool_order",
				store,
				{ run_id: "r1", sequence: ["Read", "Bash"] },
			);
			expect(r.passed).toBe(true);
			expect(r.matched_indices).toEqual([0, 2]);
			expect(r.missing_at).toBeNull();
		});

		it("non-contiguous: returns missing_at when not found", () => {
			const r = call<{ passed: boolean; missing_at: number | null }>("assert_tool_order", store, {
				run_id: "r1",
				sequence: ["Read", "Grep"],
			});
			expect(r.passed).toBe(false);
			expect(r.missing_at).toBe(1);
		});

		it("contiguous: requires consecutive match", () => {
			const r = call<{ passed: boolean; matched_indices: number[] }>("assert_tool_order", store, {
				run_id: "r1",
				sequence: ["Edit", "Bash"],
				contiguous: true,
			});
			expect(r.passed).toBe(true);
			expect(r.matched_indices).toEqual([1, 2]);
		});

		it("contiguous: fails for non-consecutive sequence", () => {
			const r = call<{ passed: boolean }>("assert_tool_order", store, {
				run_id: "r1",
				sequence: ["Read", "Bash"],
				contiguous: true,
			});
			expect(r.passed).toBe(false);
		});
	});

	describe("assert_latency_under", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "A", timestamp: 0 },
					{ tool_name: "B", timestamp: 100 },
					{ tool_name: "C", timestamp: 5000 },
					{ tool_name: "D", timestamp: 5100 },
				],
			});
		});

		it("checks total threshold", () => {
			const ok = call<{ passed: boolean; total_ms: number }>("assert_latency_under", store, {
				run_id: "r1",
				max_total_ms: 6000,
			});
			expect(ok.passed).toBe(true);
			expect(ok.total_ms).toBe(5100);

			const bad = call<{ passed: boolean }>("assert_latency_under", store, {
				run_id: "r1",
				max_total_ms: 1000,
			});
			expect(bad.passed).toBe(false);
		});

		it("checks per-event threshold", () => {
			const r = call<{ passed: boolean; slowest: { duration_ms: number }[] }>(
				"assert_latency_under",
				store,
				{ run_id: "r1", max_per_event_ms: 1000 },
			);
			expect(r.passed).toBe(false);
			expect(r.slowest[0]?.duration_ms).toBe(4900);
		});

		it("returns slowest sorted descending, top 5", () => {
			const r = call<{ slowest: { duration_ms: number }[] }>("assert_latency_under", store, {
				run_id: "r1",
				max_total_ms: 100000,
			});
			const durations = r.slowest.map((s) => s.duration_ms);
			expect(durations.length).toBeLessThanOrEqual(5);
			for (let i = 1; i < durations.length; i++) {
				expect(durations[i - 1]).toBeGreaterThanOrEqual(durations[i] ?? 0);
			}
		});

		it("INVALID_INPUT when neither threshold given", () => {
			try {
				call("assert_latency_under", store, { run_id: "r1" });
				expect.fail("expected throw");
			} catch (err) {
				expect((err as McpToolError).code).toBe("INVALID_INPUT");
			}
		});
	});

	describe("diff_runs", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "ra",
				events: [
					{ tool_name: "Read", args: { path: "/a", mode: "r" }, timestamp: 0, cost_usd: 0.1 },
					{ tool_name: "Edit", args: { path: "/a" }, timestamp: 100, cost_usd: 0.2 },
				],
			});
			call("record_run", store, {
				agent_id: "a",
				run_id: "rb",
				events: [
					{ tool_name: "Read", args: { path: "/b", verbose: true }, timestamp: 0, cost_usd: 0.3 },
					{ tool_name: "Edit", args: { path: "/a" }, timestamp: 200, cost_usd: 0.2 },
					{ tool_name: "Bash", timestamp: 300 },
				],
			});
		});

		it("computes cost delta", () => {
			const r = call<{ cost_a_usd: number; cost_b_usd: number; cost_delta_usd: number }>(
				"diff_runs",
				store,
				{ run_id_a: "ra", run_id_b: "rb" },
			);
			expect(r.cost_a_usd).toBeCloseTo(0.3);
			expect(r.cost_b_usd).toBeCloseTo(0.5);
			expect(r.cost_delta_usd).toBeCloseTo(0.2);
		});

		it("computes latency delta", () => {
			const r = call<{ latency_a_ms: number; latency_b_ms: number; latency_delta_ms: number }>(
				"diff_runs",
				store,
				{ run_id_a: "ra", run_id_b: "rb" },
			);
			expect(r.latency_a_ms).toBe(100);
			expect(r.latency_b_ms).toBe(300);
			expect(r.latency_delta_ms).toBe(200);
		});

		it("computes args_diff with added/removed/changed", () => {
			const r = call<{
				args_diff: {
					seq: number;
					tool_name: string;
					added: string[];
					removed: string[];
					changed: string[];
				}[];
			}>("diff_runs", store, { run_id_a: "ra", run_id_b: "rb" });
			const seq0 = r.args_diff.find((d) => d.seq === 0);
			expect(seq0).toBeDefined();
			expect(seq0?.added).toEqual(["verbose"]);
			expect(seq0?.removed).toEqual(["mode"]);
			expect(seq0?.changed).toEqual(["path"]);
		});

		it("computes tool_diff for diverging sequences", () => {
			const r = call<{ tool_diff: { index: number; a: string | null; b: string | null }[] }>(
				"diff_runs",
				store,
				{ run_id_a: "ra", run_id_b: "rb" },
			);
			expect(r.tool_diff).toEqual([{ index: 2, a: null, b: "Bash" }]);
		});
	});

	describe("record_canonical + assert_no_drift", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "happy-1",
				events: [
					{ tool_name: "Read", timestamp: 1 },
					{ tool_name: "Edit", timestamp: 2 },
					{ tool_name: "Bash", timestamp: 3 },
				],
			});
			call("record_run", store, {
				agent_id: "a",
				run_id: "happy-2",
				events: [
					{ tool_name: "Read", timestamp: 1 },
					{ tool_name: "Edit", timestamp: 2 },
					{ tool_name: "Bash", timestamp: 3 },
				],
			});
		});

		it("records canonical from multiple matching runs", () => {
			const r = call<{ tool_sequence: string[]; source_run_count: number }>(
				"record_canonical",
				store,
				{ name: "happy", run_ids: ["happy-1", "happy-2"] },
			);
			expect(r.tool_sequence).toEqual(["Read", "Edit", "Bash"]);
			expect(r.source_run_count).toBe(2);
		});

		it("rejects runs whose sequences disagree (SEQUENCE_MISMATCH)", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "weird",
				events: [{ tool_name: "Read", timestamp: 1 }],
			});
			try {
				call("record_canonical", store, { name: "x", run_ids: ["happy-1", "weird"] });
				expect.fail("expected throw");
			} catch (err) {
				expect((err as McpToolError).code).toBe("SEQUENCE_MISMATCH");
			}
		});

		it("assert_no_drift passes for matching run", () => {
			call("record_canonical", store, { name: "happy", run_ids: ["happy-1"] });
			const r = call<{ passed: boolean; diff: unknown[] }>("assert_no_drift", store, {
				run_id: "happy-2",
				canonical_name: "happy",
			});
			expect(r.passed).toBe(true);
			expect(r.diff).toEqual([]);
		});

		it("assert_no_drift returns diff when run drifts", () => {
			call("record_canonical", store, { name: "happy", run_ids: ["happy-1"] });
			call("record_run", store, {
				agent_id: "a",
				run_id: "drifted",
				events: [
					{ tool_name: "Read", timestamp: 1 },
					{ tool_name: "Bash", timestamp: 2 },
					{ tool_name: "Bash", timestamp: 3 },
				],
			});
			const r = call<{
				passed: boolean;
				diff: Array<{ index: number; expected: string | null; actual: string | null }>;
			}>("assert_no_drift", store, { run_id: "drifted", canonical_name: "happy" });
			expect(r.passed).toBe(false);
			expect(r.diff[0]).toEqual({ index: 1, expected: "Edit", actual: "Bash" });
		});

		it("assert_no_drift errors with CANONICAL_NOT_FOUND on unknown canonical", () => {
			try {
				call("assert_no_drift", store, { run_id: "happy-1", canonical_name: "missing" });
				expect.fail("expected throw");
			} catch (err) {
				expect((err as McpToolError).code).toBe("CANONICAL_NOT_FOUND");
			}
		});
	});

	describe("replay_run", () => {
		beforeEach(() => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "A", args: { x: 1 }, result: "orig-A", timestamp: 1 },
					{ tool_name: "B", result: "orig-B", timestamp: 2 },
					{ tool_name: "C", result: "orig-C", timestamp: 3 },
				],
			});
		});

		it("returns events in seq order with from_seq", () => {
			const all = call<{ events: { tool_name: string; seq: number }[] }>("replay_run", store, {
				run_id: "r1",
			});
			expect(all.events.map((e) => e.tool_name)).toEqual(["A", "B", "C"]);

			const partial = call<{ events: { tool_name: string }[] }>("replay_run", store, {
				run_id: "r1",
				from_seq: 1,
			});
			expect(partial.events.map((e) => e.tool_name)).toEqual(["B", "C"]);
		});

		it("from_seq wins over from_event_id when both supplied", () => {
			const r = call<{ events: { tool_name: string }[] }>("replay_run", store, {
				run_id: "r1",
				from_seq: 2,
				from_event_id: 0,
			});
			expect(r.events.map((e) => e.tool_name)).toEqual(["C"]);
		});

		it("falls back to deprecated from_event_id when from_seq absent", () => {
			const r = call<{ events: { tool_name: string }[] }>("replay_run", store, {
				run_id: "r1",
				from_event_id: 1,
			});
			expect(r.events.map((e) => e.tool_name)).toEqual(["B", "C"]);
		});

		it("substitute swaps result for matching tool_name (deep clone per event)", () => {
			const sub = { foo: "bar" };
			const r = call<{ events: { tool_name: string; result: unknown }[] }>("replay_run", store, {
				run_id: "r1",
				substitute: { B: sub },
			});
			const bEvent = r.events.find((e) => e.tool_name === "B");
			expect(bEvent?.result).toEqual({ foo: "bar" });
			expect(bEvent?.result).not.toBe(sub);
			const aEvent = r.events.find((e) => e.tool_name === "A");
			expect(aEvent?.result).toBe("orig-A");
		});

		it("preserves original behavior when neither from_seq nor from_event_id given", () => {
			const r = call<{ events: { tool_name: string }[] }>("replay_run", store, {
				run_id: "r1",
			});
			expect(r.events).toHaveLength(3);
		});
	});

	describe("get_run / list_runs", () => {
		it("get_run returns the run plus its events", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [{ tool_name: "A", timestamp: 1 }],
			});
			const r = call<{ run: { id: string }; events: unknown[] }>("get_run", store, {
				run_id: "r1",
			});
			expect(r.run.id).toBe("r1");
			expect(r.events).toHaveLength(1);
		});

		it("list_runs returns all runs newest-first", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [{ tool_name: "A", timestamp: 100 }],
			});
			call("record_run", store, {
				agent_id: "b",
				run_id: "r2",
				events: [{ tool_name: "A", timestamp: 200 }],
			});
			const all = call<{ runs: Array<{ id: string }> }>("list_runs", store, {});
			expect(all.runs.map((r) => r.id)).toEqual(["r2", "r1"]);

			const filtered = call<{ runs: Array<{ id: string }> }>("list_runs", store, {
				agent_id: "a",
			});
			expect(filtered.runs.map((r) => r.id)).toEqual(["r1"]);
		});
	});
});
