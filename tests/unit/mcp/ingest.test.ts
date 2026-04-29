import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ingestFile } from "../../../src/mcp/ingest.js";
import { Store } from "../../../src/mcp/store.js";

describe("ingestFile", () => {
	let tmp: string;
	let dbPath: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "kovar-ingest-"));
		dbPath = join(tmp, "test.db");
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	it("ingests a kovar-jsonl file and persists run + events + messages", async () => {
		const filePath = join(tmp, "session.jsonl");
		const lines = [
			JSON.stringify({ type: "run", metadata: { task: "demo" } }),
			JSON.stringify({
				type: "event",
				tool_name: "search",
				args: { q: "hi" },
				result: "found",
				timestamp: 1000,
			}),
			JSON.stringify({
				type: "event",
				tool_name: "summarize",
				args: {},
				result: "ok",
				timestamp: 2000,
			}),
			JSON.stringify({ type: "message", role: "user", content: "hello", timestamp: 999 }),
		];
		writeFileSync(filePath, lines.join("\n"), "utf8");

		const result = await ingestFile({
			filePath,
			format: "kovar-jsonl",
			agentId: "tester",
			dbPath,
		});

		expect(result.eventCount).toBe(2);
		expect(result.messageCount).toBe(1);
		expect(result.runId).toBe("session");

		const store = new Store({ dbPath });
		try {
			const run = store.getRun("session");
			expect(run).not.toBeNull();
			expect(run?.agentId).toBe("tester");
			expect(run?.metadata).toEqual({ task: "demo" });
			expect(run?.startedAt).toBe(1000);
			expect(run?.endedAt).toBe(2000);

			const events = store.getEvents("session");
			expect(events.map((e) => e.toolName)).toEqual(["search", "summarize"]);

			const messages = store.getMessages("session");
			expect(messages).toHaveLength(1);
			expect(messages[0]?.content).toBe("hello");
		} finally {
			store.close();
		}
	});

	it("respects an explicit runId", async () => {
		const filePath = join(tmp, "session.jsonl");
		writeFileSync(
			filePath,
			JSON.stringify({ type: "event", tool_name: "noop", timestamp: 1 }),
			"utf8",
		);
		const result = await ingestFile({
			filePath,
			format: "kovar-jsonl",
			runId: "custom-run-id",
			dbPath,
		});
		expect(result.runId).toBe("custom-run-id");
		const store = new Store({ dbPath });
		try {
			expect(store.getRun("custom-run-id")).not.toBeNull();
		} finally {
			store.close();
		}
	});

	it("throws when format is unknown, listing available formats", async () => {
		const filePath = join(tmp, "session.jsonl");
		writeFileSync(filePath, "", "utf8");
		await expect(ingestFile({ filePath, format: "no-such-format", dbPath })).rejects.toThrow(
			/kovar-jsonl/,
		);
		await expect(ingestFile({ filePath, format: "no-such-format", dbPath })).rejects.toThrow(
			/claude-code/,
		);
	});

	it("ingests a claude-code session and links tool_use/tool_result", async () => {
		const filePath = join(tmp, "claude-session.jsonl");
		const lines = [
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "hi" },
				timestamp: "2026-04-28T12:00:00.000Z",
			}),
			JSON.stringify({
				type: "assistant",
				message: {
					role: "assistant",
					content: [{ type: "tool_use", id: "tu_1", name: "search", input: { q: "x" } }],
				},
				timestamp: "2026-04-28T12:00:01.000Z",
			}),
			JSON.stringify({
				type: "user",
				message: {
					role: "user",
					content: [{ type: "tool_result", tool_use_id: "tu_1", content: "done" }],
				},
				timestamp: "2026-04-28T12:00:02.000Z",
			}),
		];
		writeFileSync(filePath, lines.join("\n"), "utf8");
		const result = await ingestFile({ filePath, format: "claude-code", dbPath });
		expect(result.eventCount).toBe(1);

		const store = new Store({ dbPath });
		try {
			const events = store.getEvents(result.runId);
			expect(events[0]?.toolName).toBe("search");
			expect(events[0]?.result).toBe("done");
		} finally {
			store.close();
		}
	});
});
