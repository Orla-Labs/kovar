import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../../../src/mcp/store.js";
import type { Run } from "../../../src/mcp/types.js";

const baseRun = (overrides: Partial<Run> = {}): Run => ({
	id: "run-1",
	agentId: "agent-a",
	status: "completed",
	startedAt: 1_000,
	endedAt: 2_000,
	metadata: { task: "demo" },
	...overrides,
});

describe("Store", () => {
	let store: Store;

	beforeEach(() => {
		store = new Store({ dbPath: ":memory:" });
	});

	describe("runs", () => {
		it("creates and gets a run", () => {
			store.createRun(baseRun());
			const got = store.getRun("run-1");
			expect(got).toEqual(baseRun());
		});

		it("returns null for unknown run", () => {
			expect(store.getRun("missing")).toBeNull();
		});

		it("rejects duplicate run ids via PRIMARY KEY", () => {
			store.createRun(baseRun());
			expect(() => store.createRun(baseRun())).toThrow();
		});

		it("lists runs newest-first, optionally filtered by agent", () => {
			store.createRun(baseRun({ id: "r1", agentId: "a", startedAt: 100 }));
			store.createRun(baseRun({ id: "r2", agentId: "b", startedAt: 200 }));
			store.createRun(baseRun({ id: "r3", agentId: "a", startedAt: 300 }));
			expect(store.listRuns().map((r) => r.id)).toEqual(["r3", "r2", "r1"]);
			expect(store.listRuns("a").map((r) => r.id)).toEqual(["r3", "r1"]);
		});

		it("updates run status and ended_at", () => {
			store.createRun(baseRun({ status: "running", endedAt: null }));
			store.updateRunStatus("run-1", "failed", 5_000);
			const got = store.getRun("run-1");
			expect(got?.status).toBe("failed");
			expect(got?.endedAt).toBe(5_000);
		});
	});

	describe("events", () => {
		beforeEach(() => store.createRun(baseRun()));

		it("appends events with auto-incrementing seq starting at 0", () => {
			const inserted = store.appendEvents("run-1", [
				{ toolName: "Read", args: { path: "/a" }, result: "ok", costUsd: 0.01, timestamp: 1 },
				{ toolName: "Edit", args: { path: "/a" }, result: null, costUsd: 0.02, timestamp: 2 },
			]);
			expect(inserted.map((e) => e.seq)).toEqual([0, 1]);
			expect(inserted[0]?.toolName).toBe("Read");
			expect(inserted[0]?.args).toEqual({ path: "/a" });
			expect(inserted[1]?.costUsd).toBe(0.02);
		});

		it("continues seq across multiple appendEvents calls", () => {
			store.appendEvents("run-1", [
				{ toolName: "A", args: {}, result: null, costUsd: null, timestamp: 1 },
			]);
			const second = store.appendEvents("run-1", [
				{ toolName: "B", args: {}, result: null, costUsd: null, timestamp: 2 },
			]);
			expect(second[0]?.seq).toBe(1);
		});

		it("getEvents returns events in seq order, optionally from a starting seq", () => {
			store.appendEvents("run-1", [
				{ toolName: "A", args: {}, result: null, costUsd: null, timestamp: 1 },
				{ toolName: "B", args: {}, result: null, costUsd: null, timestamp: 2 },
				{ toolName: "C", args: {}, result: null, costUsd: null, timestamp: 3 },
			]);
			expect(store.getEvents("run-1").map((e) => e.toolName)).toEqual(["A", "B", "C"]);
			expect(store.getEvents("run-1", 1).map((e) => e.toolName)).toEqual(["B", "C"]);
		});

		it("round-trips complex result payloads via JSON", () => {
			const result = { nested: { items: [1, "two", null] } };
			store.appendEvents("run-1", [
				{ toolName: "X", args: {}, result, costUsd: null, timestamp: 1 },
			]);
			const [got] = store.getEvents("run-1");
			expect(got?.result).toEqual(result);
		});

		it("cascades event deletion when a run is deleted (FK ON DELETE CASCADE)", () => {
			store.appendEvents("run-1", [
				{ toolName: "A", args: {}, result: null, costUsd: null, timestamp: 1 },
			]);
			// biome-ignore lint/suspicious/noExplicitAny: reaching into private db for cascade test
			(store as any).db.prepare("DELETE FROM runs WHERE id = ?").run("run-1");
			expect(store.getEvents("run-1")).toEqual([]);
		});
	});

	describe("canonicals", () => {
		it("upserts and retrieves canonicals", () => {
			store.upsertCanonical({ name: "checkout", toolSequence: ["A", "B"], createdAt: 100 });
			expect(store.getCanonical("checkout")).toEqual({
				name: "checkout",
				toolSequence: ["A", "B"],
				createdAt: 100,
			});
		});

		it("overwrites existing canonical on conflict", () => {
			store.upsertCanonical({ name: "x", toolSequence: ["A"], createdAt: 1 });
			store.upsertCanonical({ name: "x", toolSequence: ["A", "B"], createdAt: 2 });
			expect(store.getCanonical("x")?.toolSequence).toEqual(["A", "B"]);
		});

		it("returns null for unknown canonical", () => {
			expect(store.getCanonical("missing")).toBeNull();
		});
	});
});
