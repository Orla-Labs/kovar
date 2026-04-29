import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runProxyWithStreams } from "../../../src/mcp/proxy.js";
import { Store } from "../../../src/mcp/store.js";

// Build a tiny Node `-e` script that acts as a fake MCP child server.
// It reads JSON lines from stdin and responds based on method.
const FAKE_SERVER_SCRIPT = `
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\\n")) !== -1) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    let req;
    try { req = JSON.parse(line); } catch { process.stdout.write("not-json-noise\\n"); continue; }
    if (req && req.method === "tools/call") {
      const reply = JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { ok: true, name: req.params && req.params.name } }) + "\\n";
      process.stdout.write(reply);
    } else if (req && req.method === "shutdown") {
      const reply = JSON.stringify({ jsonrpc: "2.0", id: req.id, result: {} }) + "\\n";
      process.stdout.write(reply);
      setTimeout(() => process.exit(0), 5);
    } else {
      const reply = JSON.stringify({ jsonrpc: "2.0", id: req.id, result: {} }) + "\\n";
      process.stdout.write(reply);
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;

describe("MCP proxy", () => {
	let tmp: string;
	let dbPath: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "kovar-proxy-"));
		dbPath = join(tmp, "test.db");
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	function makeStreams() {
		const parentIn = new PassThrough();
		const parentOut = new PassThrough();
		const parentErr = new PassThrough();
		const outChunks: Buffer[] = [];
		parentOut.on("data", (c: Buffer) => outChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
		const errChunks: Buffer[] = [];
		parentErr.on("data", (c: Buffer) => errChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
		return { parentIn, parentOut, parentErr, outChunks, errChunks };
	}

	function waitForOut(outChunks: Buffer[], predicate: (s: string) => boolean, timeoutMs = 2000) {
		return new Promise<void>((resolve, reject) => {
			const start = Date.now();
			const tick = () => {
				const joined = Buffer.concat(outChunks).toString("utf8");
				if (predicate(joined)) return resolve();
				if (Date.now() - start > timeoutMs) {
					return reject(new Error(`waitForOut timed out. Got: ${joined.slice(0, 500)}`));
				}
				setTimeout(tick, 10);
			};
			tick();
		});
	}

	it("snoops a tools/call request and records an event when the child replies", async () => {
		const streams = makeStreams();
		const handle = runProxyWithStreams(
			{
				command: process.execPath,
				args: ["-e", FAKE_SERVER_SCRIPT],
				agentId: "test-agent",
				runId: "proxy-test-1",
				dbPath,
			},
			streams,
		);

		const callLine = `${JSON.stringify({
			jsonrpc: "2.0",
			id: 7,
			method: "tools/call",
			params: { name: "search", arguments: { q: "hello" } },
		})}\n`;
		streams.parentIn.write(callLine);

		await waitForOut(streams.outChunks, (s) => s.includes('"id":7'));

		// Now ask the fake server to shutdown so the proxy run closes cleanly.
		const shutdownLine = `${JSON.stringify({ jsonrpc: "2.0", id: 99, method: "shutdown" })}\n`;
		streams.parentIn.write(shutdownLine);
		streams.parentIn.end();

		const code = await handle.finished;
		expect(code).toBe(0);

		const store = new Store({ dbPath });
		try {
			const run = store.getRun("proxy-test-1");
			expect(run).not.toBeNull();
			expect(run?.status).toBe("completed");
			expect(run?.agentId).toBe("test-agent");

			const events = store.getEvents("proxy-test-1");
			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				toolName: "search",
				args: { q: "hello" },
			});
			expect(events[0]?.result).toMatchObject({ ok: true, name: "search" });
		} finally {
			store.close();
		}
	});

	it("preserves byte-exact passthrough on parent stdout", async () => {
		const streams = makeStreams();
		const handle = runProxyWithStreams(
			{
				command: process.execPath,
				args: ["-e", FAKE_SERVER_SCRIPT],
				runId: "proxy-test-passthrough",
				dbPath,
			},
			streams,
		);

		// Send a tools/call. Fake server responds with a deterministic line we can match exactly.
		const callLine = `${JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: "noop", arguments: {} },
		})}\n`;
		streams.parentIn.write(callLine);

		// Predict the exact reply the fake server will write.
		const expectedReply = `${JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			result: { ok: true, name: "noop" },
		})}\n`;

		await waitForOut(streams.outChunks, (s) => s.length >= expectedReply.length);

		const got = Buffer.concat(streams.outChunks).toString("utf8");
		expect(got).toBe(expectedReply);

		streams.parentIn.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "shutdown" })}\n`);
		streams.parentIn.end();
		await handle.finished;
	});

	it("does not crash when a malformed JSON line passes through", async () => {
		const streams = makeStreams();
		const handle = runProxyWithStreams(
			{
				command: process.execPath,
				args: ["-e", FAKE_SERVER_SCRIPT],
				runId: "proxy-test-malformed",
				dbPath,
			},
			streams,
		);

		// Send a malformed line first — proxy should pass it through and not throw.
		streams.parentIn.write("not-json-noise\n");
		// Now a real call to confirm subsequent traffic still works.
		const callLine = `${JSON.stringify({
			jsonrpc: "2.0",
			id: 5,
			method: "tools/call",
			params: { name: "still-works", arguments: {} },
		})}\n`;
		streams.parentIn.write(callLine);

		await waitForOut(streams.outChunks, (s) => s.includes('"id":5'));

		streams.parentIn.write(`${JSON.stringify({ jsonrpc: "2.0", id: 99, method: "shutdown" })}\n`);
		streams.parentIn.end();
		const code = await handle.finished;
		expect(code).toBe(0);

		const store = new Store({ dbPath });
		try {
			const events = store.getEvents("proxy-test-malformed");
			expect(events.map((e) => e.toolName)).toEqual(["still-works"]);
		} finally {
			store.close();
		}
	});

	it("marks run failed when child exits with non-zero code", async () => {
		const streams = makeStreams();
		const handle = runProxyWithStreams(
			{
				command: process.execPath,
				args: ["-e", "process.exit(2)"],
				runId: "proxy-test-fail",
				dbPath,
			},
			streams,
		);
		const code = await handle.finished;
		expect(code).toBe(2);

		const store = new Store({ dbPath });
		try {
			const run = store.getRun("proxy-test-fail");
			expect(run?.status).toBe("failed");
			expect(run?.endedAt).not.toBeNull();
		} finally {
			store.close();
		}
	});

	it("writes the startup banner to parentErr (not parentOut)", async () => {
		const streams = makeStreams();
		const handle = runProxyWithStreams(
			{
				command: process.execPath,
				args: ["-e", "process.exit(0)"],
				runId: "proxy-test-banner",
				dbPath,
			},
			streams,
		);
		await handle.finished;
		const errText = Buffer.concat(streams.errChunks).toString("utf8");
		expect(errText).toMatch(/kovar proxy/);
		expect(errText).toContain("run=proxy-test-banner");
		// stdout must not contain the banner
		const outText = Buffer.concat(streams.outChunks).toString("utf8");
		expect(outText).not.toMatch(/kovar proxy/);
	});
});
