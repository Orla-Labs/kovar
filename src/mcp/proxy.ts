import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import { Store, type StoreOptions } from "./store.js";
import type { Run } from "./types.js";

export interface StartProxyServerOptions {
	command: string;
	args: string[];
	agentId?: string;
	runId?: string;
	dbPath?: string;
}

interface ProxyStreams {
	parentIn: Readable;
	parentOut: Writable;
	parentErr: Writable;
}

interface PendingCall {
	toolName: string;
	args: Record<string, unknown>;
	requestedAt: number;
}

class LineReader {
	private buffer = "";

	push(chunk: Buffer | string): string[] {
		this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		const out: string[] = [];
		let nl = this.buffer.indexOf("\n");
		while (nl !== -1) {
			out.push(this.buffer.slice(0, nl));
			this.buffer = this.buffer.slice(nl + 1);
			nl = this.buffer.indexOf("\n");
		}
		return out;
	}
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function generateRunId(): string {
	return `proxy-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function frameKey(id: unknown): string | null {
	if (typeof id === "string") return `s:${id}`;
	if (typeof id === "number") return `n:${id}`;
	return null;
}

interface ProxyHandle {
	exitCode: number | null;
	finished: Promise<number>;
}

/**
 * Internal: run the proxy with explicit stream injection so tests can drive it
 * without spawning the real CLI. The CLI wraps this with process.stdin/out/err.
 */
export function runProxyWithStreams(
	opts: StartProxyServerOptions,
	streams: ProxyStreams,
): ProxyHandle {
	const runId = opts.runId ?? generateRunId();
	const agentId = opts.agentId ?? "proxy";

	const storeOpts: StoreOptions = {};
	if (opts.dbPath) storeOpts.dbPath = opts.dbPath;
	const store = new Store(storeOpts);

	const startedAt = Date.now();
	const initialRun: Run = {
		id: runId,
		agentId,
		status: "running",
		startedAt,
		endedAt: null,
		metadata: { mode: "proxy", child_command: opts.command, child_args: opts.args },
	};
	store.createRun(initialRun);

	streams.parentErr.write(`kovar proxy → ${opts.command} ${opts.args.join(" ")} | run=${runId}\n`);

	const child: ChildProcessWithoutNullStreams = spawn(opts.command, opts.args, {
		stdio: ["pipe", "pipe", "pipe"],
	});

	const pending = new Map<string, PendingCall>();
	const parentToChild = new LineReader();
	const childToParent = new LineReader();

	const snoopParentLine = (line: string): void => {
		if (line.length === 0) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (!isRecord(parsed)) return;
		if (parsed.method !== "tools/call") return;
		const key = frameKey(parsed.id);
		if (!key) return;
		const params = isRecord(parsed.params) ? parsed.params : null;
		if (!params) return;
		const name = typeof params.name === "string" ? params.name : null;
		if (!name) return;
		const args = isRecord(params.arguments) ? (params.arguments as Record<string, unknown>) : {};
		pending.set(key, { toolName: name, args, requestedAt: Date.now() });
	};

	const snoopChildLine = (line: string): void => {
		if (line.length === 0) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (!isRecord(parsed)) return;
		const key = frameKey(parsed.id);
		if (!key) return;
		const stashed = pending.get(key);
		if (!stashed) return;
		if (!("result" in parsed)) {
			// error response — drop the pending entry without recording.
			pending.delete(key);
			return;
		}
		pending.delete(key);
		try {
			store.appendEvents(runId, [
				{
					toolName: stashed.toolName,
					args: stashed.args,
					result: parsed.result ?? null,
					costUsd: null,
					timestamp: Date.now(),
				},
			]);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			streams.parentErr.write(`kovar proxy: failed to record event: ${msg}\n`);
		}
	};

	streams.parentIn.on("data", (chunk: Buffer | string) => {
		const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
		child.stdin.write(buf);
		for (const line of parentToChild.push(buf)) {
			snoopParentLine(line);
		}
	});
	streams.parentIn.on("end", () => {
		try {
			child.stdin.end();
		} catch {
			// child may already be gone
		}
	});

	child.stdout.on("data", (chunk: Buffer) => {
		streams.parentOut.write(chunk);
		for (const line of childToParent.push(chunk)) {
			snoopChildLine(line);
		}
	});
	child.stderr.on("data", (chunk: Buffer) => {
		streams.parentErr.write(chunk);
	});

	let signalCount = 0;
	const onSignal = (sig: NodeJS.Signals) => {
		signalCount++;
		if (signalCount >= 2) {
			child.kill("SIGKILL");
			return;
		}
		try {
			child.kill(sig);
		} catch {
			// ignore — child may have exited
		}
	};
	const sigInt = () => onSignal("SIGINT");
	const sigTerm = () => onSignal("SIGTERM");

	// Only attach signal handlers when running with the real process; tests
	// can pass any Readable for parentIn so we guard against process global.
	const attachSignals = streams.parentIn === process.stdin;
	if (attachSignals) {
		process.on("SIGINT", sigInt);
		process.on("SIGTERM", sigTerm);
	}

	const handle: ProxyHandle = {
		exitCode: null,
		finished: new Promise<number>((resolve) => {
			child.on("exit", (code, signal) => {
				const exitCode = code ?? (signal ? 1 : 0);
				handle.exitCode = exitCode;
				try {
					store.updateRunStatus(runId, exitCode === 0 ? "completed" : "failed", Date.now());
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					streams.parentErr.write(`kovar proxy: failed to update run status: ${msg}\n`);
				}
				try {
					store.close();
				} catch {
					// ignore
				}
				if (attachSignals) {
					process.off("SIGINT", sigInt);
					process.off("SIGTERM", sigTerm);
				}
				resolve(exitCode);
			});
			child.on("error", (err) => {
				streams.parentErr.write(`kovar proxy: child spawn error: ${err.message}\n`);
				try {
					store.updateRunStatus(runId, "failed", Date.now());
					store.close();
				} catch {
					// ignore
				}
				handle.exitCode = 1;
				resolve(1);
			});
		}),
	};
	return handle;
}

export async function startProxyServer(opts: StartProxyServerOptions): Promise<void> {
	const handle = runProxyWithStreams(opts, {
		parentIn: process.stdin,
		parentOut: process.stdout,
		parentErr: process.stderr,
	});
	const code = await handle.finished;
	process.exit(code);
}
