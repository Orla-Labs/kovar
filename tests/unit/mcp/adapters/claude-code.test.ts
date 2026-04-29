import { describe, expect, it } from "vitest";
import { claudeCodeAdapter } from "../../../../src/mcp/adapters/claude-code.js";

const ctx = { defaultAgentId: "ingest", defaultRunId: "run-x" };

describe("claude-code adapter", () => {
	it("maps tool_use, tool_result, and plain text messages", () => {
		const lines = [
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "please search" },
				timestamp: "2026-04-28T12:00:00.000Z",
			}),
			JSON.stringify({
				type: "assistant",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "Sure, searching now." },
						{
							type: "tool_use",
							id: "tu_1",
							name: "search",
							input: { query: "hello world" },
						},
					],
				},
				timestamp: "2026-04-28T12:00:01.000Z",
			}),
			JSON.stringify({
				type: "user",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "tu_1",
							content: "found 3 results",
						},
					],
				},
				timestamp: "2026-04-28T12:00:02.000Z",
			}),
		];
		const out = claudeCodeAdapter.parse(lines.join("\n"), ctx);

		expect(out.events).toHaveLength(1);
		expect(out.events[0]).toMatchObject({
			toolName: "search",
			args: { query: "hello world" },
			result: "found 3 results",
		});
		expect(out.events[0]?.timestamp).toBe(Date.parse("2026-04-28T12:00:01.000Z"));

		// One user message ("please search") + one assistant message ("Sure, searching now.")
		// The tool_result-only user line produces no plain text message.
		expect(out.messages).toHaveLength(2);
		const roles = (out.messages ?? []).map((m) => m.role);
		expect(roles).toContain("user");
		expect(roles).toContain("assistant");
		const userMsg = (out.messages ?? []).find((m) => m.role === "user");
		expect(userMsg?.content).toBe("please search");

		expect(out.run.status).toBe("completed");
		expect(out.run.metadata).toMatchObject({ source: "claude-code" });
	});

	it("ignores malformed lines without crashing", () => {
		const lines = [
			"not-json-at-all",
			JSON.stringify({
				type: "assistant",
				message: {
					role: "assistant",
					content: [{ type: "tool_use", id: "tu_a", name: "noop", input: {} }],
				},
				timestamp: "2026-04-28T12:00:01.000Z",
			}),
		];
		const out = claudeCodeAdapter.parse(lines.join("\n"), ctx);
		expect(out.events).toHaveLength(1);
		expect(out.events[0]?.toolName).toBe("noop");
	});

	it("handles tool_result whose content is an array of text blocks", () => {
		const lines = [
			JSON.stringify({
				type: "assistant",
				message: {
					role: "assistant",
					content: [{ type: "tool_use", id: "tu_2", name: "x", input: {} }],
				},
				timestamp: "2026-04-28T12:00:01.000Z",
			}),
			JSON.stringify({
				type: "user",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "tu_2",
							content: [
								{ type: "text", text: "line1" },
								{ type: "text", text: "line2" },
							],
						},
					],
				},
				timestamp: "2026-04-28T12:00:02.000Z",
			}),
		];
		const out = claudeCodeAdapter.parse(lines.join("\n"), ctx);
		expect(out.events[0]?.result).toBe("line1\nline2");
	});
});
