import { describe, expect, it } from "vitest";
import { kovarJsonlAdapter } from "../../../../src/mcp/adapters/kovar-jsonl.js";

const ctx = { defaultAgentId: "ingest", defaultRunId: "run-x" };

describe("kovar-jsonl adapter", () => {
	it("parses a run line, events, and a message", () => {
		const content = [
			JSON.stringify({
				type: "run",
				run_id: "ignored-uses-ctx-default",
				agent_id: "ignored-uses-ctx-default",
				started_at: 1000,
				ended_at: 5000,
				status: "completed",
				metadata: { task: "demo" },
			}),
			JSON.stringify({
				type: "event",
				tool_name: "search",
				args: { q: "hi" },
				result: { hits: 3 },
				cost_usd: 0.01,
				tokens_in: 12,
				tokens_out: 7,
				timestamp: 1100,
			}),
			JSON.stringify({
				type: "event",
				tool_name: "summarize",
				args: {},
				result: "ok",
				timestamp: 1200,
			}),
			JSON.stringify({
				type: "message",
				role: "user",
				content: "hello",
				timestamp: 1050,
			}),
		].join("\n");

		const out = kovarJsonlAdapter.parse(content, ctx);
		expect(out.events).toHaveLength(2);
		expect(out.events[0]).toMatchObject({
			toolName: "search",
			args: { q: "hi" },
			result: { hits: 3 },
			costUsd: 0.01,
			tokensIn: 12,
			tokensOut: 7,
			timestamp: 1100,
		});
		expect(out.events[1]).toMatchObject({ toolName: "summarize", result: "ok" });
		expect(out.messages).toHaveLength(1);
		expect(out.messages?.[0]).toMatchObject({ role: "user", content: "hello" });
		expect(out.run.startedAt).toBe(1000);
		expect(out.run.endedAt).toBe(5000);
		expect(out.run.status).toBe("completed");
		expect(out.run.metadata).toEqual({ task: "demo" });
	});

	it("ignores empty lines and comment lines starting with #", () => {
		const content = [
			"",
			"# this is a comment",
			JSON.stringify({ type: "event", tool_name: "ping", timestamp: 100 }),
			"   ",
			"# another comment",
			JSON.stringify({ type: "event", tool_name: "pong", timestamp: 200 }),
			"",
		].join("\n");
		const out = kovarJsonlAdapter.parse(content, ctx);
		expect(out.events.map((e) => e.toolName)).toEqual(["ping", "pong"]);
	});

	it("throws with line number on malformed JSON", () => {
		const content = ["{not-valid-json", JSON.stringify({ type: "event", tool_name: "x" })].join(
			"\n",
		);
		expect(() => kovarJsonlAdapter.parse(content, ctx)).toThrow(/line 1/);
	});

	it("throws with line number on unknown type", () => {
		const content = JSON.stringify({ type: "weird", foo: 1 });
		expect(() => kovarJsonlAdapter.parse(content, ctx)).toThrow(/line 1/);
	});

	it("throws when more than one run line is present", () => {
		const content = [
			JSON.stringify({ type: "run", started_at: 1 }),
			JSON.stringify({ type: "run", started_at: 2 }),
		].join("\n");
		expect(() => kovarJsonlAdapter.parse(content, ctx)).toThrow(/second run/);
	});

	it("event missing tool_name raises a clear error", () => {
		const content = JSON.stringify({ type: "event", timestamp: 1 });
		expect(() => kovarJsonlAdapter.parse(content, ctx)).toThrow(/tool_name/);
	});

	it("returns empty events/messages when content is blank", () => {
		const out = kovarJsonlAdapter.parse("\n\n# only comments\n", ctx);
		expect(out.events).toEqual([]);
		expect(out.messages).toEqual([]);
		expect(out.run.metadata).toEqual({});
	});
});
