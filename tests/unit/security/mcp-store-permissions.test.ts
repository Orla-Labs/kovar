import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../../../src/mcp/store.js";

// R2 / M-1: ~/.kovar/runs.db stores plaintext tool args/results. Before the fix the
// directory was created 0777&~umask (0755) and the db 0644: world-readable on
// multi-user hosts / shared CI runners.
const posix = process.platform !== "win32";

describe.runIf(posix)("security: MCP store file permissions (M-1)", () => {
	let tmp: string;
	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "kovar-perm-"));
	});
	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	it("creates a new db directory 0700 and db/wal/shm files 0600", () => {
		const dbPath = join(tmp, "nested", "runs.db");
		const store = new Store({ dbPath });
		store.createRun({
			id: "r1",
			agentId: "a",
			status: "running",
			startedAt: 1,
			endedAt: null,
			metadata: { secret: "sk-live-should-not-be-world-readable" },
		});
		expect(statSync(join(tmp, "nested")).mode & 0o777).toBe(0o700);
		for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
			expect((statSync(f).mode & 0o777).toString(8), f).toBe("600");
		}
		store.close();
	});

	it("tightens an existing world-readable db file", () => {
		const dbPath = join(tmp, "runs.db");
		writeFileSync(dbPath, "", { mode: 0o644 });
		const store = new Store({ dbPath });
		expect((statSync(dbPath).mode & 0o777).toString(8)).toBe("600");
		store.close();
	});
});
