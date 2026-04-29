import Database from "better-sqlite3";
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

	describe("schema migrations", () => {
		const LATEST_VERSION = 1;

		const readSchemaVersion = (s: Store): number => {
			// biome-ignore lint/suspicious/noExplicitAny: reaching into private db for migration test
			const row = (s as any).db
				.prepare("SELECT value FROM meta WHERE key = ?")
				.get("schema_version") as { value: string } | undefined;
			return row ? Number.parseInt(row.value, 10) : 0;
		};

		it("creates the meta table and reaches the latest schema_version on a fresh DB", () => {
			expect(readSchemaVersion(store)).toBe(LATEST_VERSION);
			// biome-ignore lint/suspicious/noExplicitAny: reaching into private db for migration test
			const tables = (store as any).db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
				.all() as { name: string }[];
			const names = tables.map((t) => t.name);
			expect(names).toContain("meta");
			expect(names).toContain("messages");
		});

		it("migrates a simulated v0.5.0 DB cleanly when Store is constructed", () => {
			const tmpPath = `/tmp/kovar-store-mig-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
			const legacy = new Database(tmpPath);
			legacy.pragma("journal_mode = WAL");
			legacy.pragma("foreign_keys = ON");
			legacy.exec(`
				CREATE TABLE runs (
					id TEXT PRIMARY KEY,
					agent_id TEXT NOT NULL,
					status TEXT NOT NULL,
					started_at INTEGER NOT NULL,
					ended_at INTEGER,
					metadata TEXT NOT NULL DEFAULT '{}'
				);
				CREATE TABLE events (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
					seq INTEGER NOT NULL,
					tool_name TEXT NOT NULL,
					args TEXT NOT NULL DEFAULT '{}',
					result TEXT,
					cost_usd REAL,
					timestamp INTEGER NOT NULL,
					UNIQUE(run_id, seq)
				);
				CREATE TABLE canonicals (
					name TEXT PRIMARY KEY,
					tool_sequence TEXT NOT NULL,
					created_at INTEGER NOT NULL
				);
			`);
			legacy
				.prepare(
					"INSERT INTO runs (id, agent_id, status, started_at, ended_at, metadata) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.run("legacy-run", "agent-x", "completed", 100, 200, "{}");
			legacy
				.prepare(
					"INSERT INTO events (run_id, seq, tool_name, args, result, cost_usd, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
				)
				.run("legacy-run", 0, "Read", "{}", null, null, 150);
			legacy.close();

			const migrated = new Store({ dbPath: tmpPath });
			try {
				expect(readSchemaVersion(migrated)).toBe(LATEST_VERSION);
				const events = migrated.getEvents("legacy-run");
				expect(events).toHaveLength(1);
				expect(events[0]?.tokensIn).toBeNull();
				expect(events[0]?.tokensOut).toBeNull();
				expect(migrated.appendMessages("legacy-run", [])).toEqual([]);
			} finally {
				migrated.close();
			}
		});

		it("does not reapply migrations when reconstructing against the same DB", () => {
			const tmpPath = `/tmp/kovar-store-reopen-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
			const first = new Store({ dbPath: tmpPath });
			first.createRun(baseRun({ id: "persist-run" }));
			first.close();

			const second = new Store({ dbPath: tmpPath });
			try {
				expect(readSchemaVersion(second)).toBe(LATEST_VERSION);
				expect(second.getRun("persist-run")?.id).toBe("persist-run");
			} finally {
				second.close();
			}
		});
	});

	describe("createRunWithEvents", () => {
		it("inserts run and events atomically with auto-assigned seq", () => {
			const inserted = store.createRunWithEvents(baseRun({ id: "atomic-run" }), [
				{ toolName: "Read", args: { p: "/a" }, result: "ok", costUsd: 0.01, timestamp: 1 },
				{ toolName: "Edit", args: { p: "/a" }, result: null, costUsd: 0.02, timestamp: 2 },
			]);
			expect(inserted.map((e) => e.seq)).toEqual([0, 1]);
			expect(store.getRun("atomic-run")?.id).toBe("atomic-run");
			expect(store.getEvents("atomic-run")).toHaveLength(2);
		});

		it("rolls back the run row if any event insert fails", () => {
			expect(() =>
				store.createRunWithEvents(baseRun({ id: "rollback-run" }), [
					{ toolName: "A", args: {}, result: null, costUsd: null, timestamp: 1 },
					// biome-ignore lint/suspicious/noExplicitAny: simulating bad caller input
					{ toolName: null as any, args: {}, result: null, costUsd: null, timestamp: 2 },
				]),
			).toThrow();
			expect(store.getRun("rollback-run")).toBeNull();
			expect(store.getEvents("rollback-run")).toEqual([]);
		});

		it("supports an empty events array (run inserted, no events)", () => {
			const inserted = store.createRunWithEvents(baseRun({ id: "empty-run" }), []);
			expect(inserted).toEqual([]);
			expect(store.getRun("empty-run")?.id).toBe("empty-run");
		});
	});

	describe("messages", () => {
		beforeEach(() => store.createRun(baseRun()));

		it("appends messages with auto-incrementing seq starting at 0", () => {
			const inserted = store.appendMessages("run-1", [
				{ role: "user", content: "hi", tokens: 5, timestamp: 1 },
				{ role: "assistant", content: "hello", tokens: 7, timestamp: 2 },
			]);
			expect(inserted.map((m) => m.seq)).toEqual([0, 1]);
			expect(inserted[0]?.role).toBe("user");
			expect(inserted[1]?.tokens).toBe(7);
		});

		it("getMessages returns messages in seq order", () => {
			store.appendMessages("run-1", [
				{ role: "user", content: "a", tokens: null, timestamp: 1 },
				{ role: "assistant", content: "b", tokens: null, timestamp: 2 },
				{ role: "tool", content: "c", tokens: null, timestamp: 3 },
			]);
			expect(store.getMessages("run-1").map((m) => m.content)).toEqual(["a", "b", "c"]);
		});

		it("continues seq across multiple appendMessages calls", () => {
			store.appendMessages("run-1", [{ role: "user", content: "x", tokens: null, timestamp: 1 }]);
			const second = store.appendMessages("run-1", [
				{ role: "assistant", content: "y", tokens: null, timestamp: 2 },
			]);
			expect(second[0]?.seq).toBe(1);
		});

		it("cascades message deletion when a run is deleted (FK ON DELETE CASCADE)", () => {
			store.appendMessages("run-1", [{ role: "user", content: "bye", tokens: null, timestamp: 1 }]);
			// biome-ignore lint/suspicious/noExplicitAny: reaching into private db for cascade test
			(store as any).db.prepare("DELETE FROM runs WHERE id = ?").run("run-1");
			expect(store.getMessages("run-1")).toEqual([]);
		});
	});

	describe("event token columns", () => {
		beforeEach(() => store.createRun(baseRun()));

		it("round-trips tokens_in and tokens_out through appendEvents and getEvents", () => {
			store.appendEvents("run-1", [
				{
					toolName: "A",
					args: {},
					result: null,
					costUsd: null,
					tokensIn: 42,
					tokensOut: 99,
					timestamp: 1,
				},
				{ toolName: "B", args: {}, result: null, costUsd: null, timestamp: 2 },
			]);
			const events = store.getEvents("run-1");
			expect(events[0]?.tokensIn).toBe(42);
			expect(events[0]?.tokensOut).toBe(99);
			expect(events[1]?.tokensIn).toBeNull();
			expect(events[1]?.tokensOut).toBeNull();
		});
	});
});
