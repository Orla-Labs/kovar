import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../../../src/mcp/store.js";
import { HANDLERS } from "../../../src/mcp/tools.js";

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

		it("rejects duplicate run_id", () => {
			call("record_run", store, { agent_id: "a", run_id: "r1" });
			expect(() => call("record_run", store, { agent_id: "a", run_id: "r1" })).toThrow(
				/already exists/,
			);
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

		it("throws when run does not exist", () => {
			expect(() =>
				call("assert_tool_called", store, { run_id: "missing", tool_name: "Read" }),
			).toThrow(/not found/);
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

		it("rejects runs whose sequences disagree", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "weird",
				events: [{ tool_name: "Read", timestamp: 1 }],
			});
			expect(() =>
				call("record_canonical", store, { name: "x", run_ids: ["happy-1", "weird"] }),
			).toThrow(/does not match/);
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
			expect(r.diff).toEqual(
				[
					{ index: 1, expected: "Edit", actual: "Bash" },
					{ index: 2, expected: "Bash", actual: "Bash" }, // same
				].filter((d) => d.expected !== d.actual),
			);
			expect(r.diff[0]).toEqual({ index: 1, expected: "Edit", actual: "Bash" });
		});

		it("assert_no_drift errors on unknown canonical", () => {
			expect(() =>
				call("assert_no_drift", store, { run_id: "happy-1", canonical_name: "missing" }),
			).toThrow(/Canonical/);
		});
	});

	describe("replay_run", () => {
		it("returns events in seq order, optionally from a given seq", () => {
			call("record_run", store, {
				agent_id: "a",
				run_id: "r1",
				events: [
					{ tool_name: "A", timestamp: 1 },
					{ tool_name: "B", timestamp: 2 },
					{ tool_name: "C", timestamp: 3 },
				],
			});
			const all = call<{ events: Array<{ tool_name: string; seq: number }> }>("replay_run", store, {
				run_id: "r1",
			});
			expect(all.events.map((e) => e.tool_name)).toEqual(["A", "B", "C"]);

			const partial = call<{ events: Array<{ tool_name: string }> }>("replay_run", store, {
				run_id: "r1",
				from_event_id: 1,
			});
			expect(partial.events.map((e) => e.tool_name)).toEqual(["B", "C"]);
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
