import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runProxyWithStreams } from "../../../src/mcp/proxy.js";
import { Store } from "../../../src/mcp/store.js";

// R2 / M-2 (documented behaviour, no fix on branch): `kovar mcp proxy` snoops every
// tools/call and persists args + results verbatim, plus the child argv in run
// metadata. Any credential an agent passes to a tool lands in runs.db in plaintext.
const CHILD = `
let b="";process.stdin.setEncoding("utf8");
process.stdin.on("data",c=>{b+=c;let n;while((n=b.indexOf("\\n"))!==-1){const l=b.slice(0,n);b=b.slice(n+1);
const r=JSON.parse(l);process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:r.id,result:{content:[{type:"text",text:"db password is hunter2-RESULT"}]}})+"\\n");}});
process.stdin.on("end",()=>process.exit(0));`;

describe("security: MCP proxy stores secrets in plaintext (M-2)", () => {
	let tmp: string;
	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "kovar-plain-"));
	});
	afterEach(() => rmSync(tmp, { recursive: true, force: true }));

	it("persists tool args, results and child argv unredacted", async () => {
		const dbPath = join(tmp, "runs.db");
		const parentIn = new PassThrough();
		const parentOut = new PassThrough();
		const parentErr = new PassThrough();
		parentOut.resume();
		parentErr.resume();
		const handle = runProxyWithStreams(
			{ command: process.execPath, args: ["-e", CHILD, "--", "--api-key=sk-ARGV-SECRET"], dbPath },
			{ parentIn, parentOut, parentErr },
		);
		parentIn.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "http_get",
					arguments: { headers: { Authorization: "Bearer ghp_ARGSECRET" } },
				},
			})}\n`,
		);
		await new Promise((r) => setTimeout(r, 300));
		parentIn.end();
		await handle.finished;
		const store = new Store({ dbPath });
		const run = store.listRuns()[0];
		expect(run).toBeDefined();
		const raw = JSON.stringify({ run, events: store.getEvents(run?.id ?? "") });
		store.close();
		expect(raw).toContain("Bearer ghp_ARGSECRET");
		expect(raw).toContain("hunter2-RESULT");
		expect(raw).toContain("sk-ARGV-SECRET");
	});
});
