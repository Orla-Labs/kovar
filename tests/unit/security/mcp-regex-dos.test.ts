import { describe, expect, it } from "vitest";
import { Store } from "../../../src/mcp/store.js";
import { HANDLERS } from "../../../src/mcp/tools.js";

// R2 / M-3: assert_messages_match compiled the caller's `matches` string with
// new RegExp() and ran it against stored content with no bound. `^(a+)+$` vs
// 30 'a' + '!' hung the MCP server for >20s (measured before the fix).
describe("security: assert_messages_match regex DoS (M-3)", () => {
	it("aborts a catastrophic regex instead of hanging the server", async () => {
		const store = new Store({ dbPath: ":memory:" });
		store.createRun({
			id: "r",
			agentId: "a",
			status: "completed",
			startedAt: 1,
			endedAt: 2,
			metadata: {},
		});
		store.appendMessages("r", [
			{ role: "user", content: `${"a".repeat(30)}!`, tokens: null, timestamp: 1 },
		]);
		const started = Date.now();
		await expect(
			Promise.resolve().then(() =>
				HANDLERS.assert_messages_match(store, { run_id: "r", expected: [{ matches: "^(a+)+$" }] }),
			),
		).rejects.toThrow(/exceeded/);
		expect(Date.now() - started).toBeLessThan(5000);
		store.close();
	}, 10000);

	it("still evaluates normal regexes", async () => {
		const store = new Store({ dbPath: ":memory:" });
		store.createRun({
			id: "r",
			agentId: "a",
			status: "completed",
			startedAt: 1,
			endedAt: 2,
			metadata: {},
		});
		store.appendMessages("r", [
			{ role: "user", content: "hello world", tokens: null, timestamp: 1 },
		]);
		const res = (await HANDLERS.assert_messages_match(store, {
			run_id: "r",
			expected: [{ matches: "^hello" }],
		})) as { passed?: boolean };
		expect(res.passed).toBe(true);
		store.close();
	});
});
