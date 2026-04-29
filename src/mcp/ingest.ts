import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { getAdapter, listAdapters } from "./adapters/index.js";
import { Store, type StoreOptions } from "./store.js";
import type { Run } from "./types.js";

export interface IngestOptions {
	filePath: string;
	format: string;
	agentId?: string;
	runId?: string;
	dbPath?: string;
}

export interface IngestResult {
	runId: string;
	eventCount: number;
	messageCount: number;
}

function defaultRunIdFromPath(filePath: string): string {
	const base = basename(filePath).replace(/\.[^.]+$/, "");
	if (base.length > 0) return base;
	return `ingest-${Date.now()}`;
}

export async function ingestFile(opts: IngestOptions): Promise<IngestResult> {
	const adapter = getAdapter(opts.format);
	if (!adapter) {
		const available = listAdapters()
			.map((a) => a.name)
			.join(", ");
		throw new Error(
			`kovar ingest: unknown format "${opts.format}". Available formats: ${available || "(none)"}`,
		);
	}

	const content = readFileSync(opts.filePath, "utf8");
	const defaultAgentId = opts.agentId ?? "ingest";
	const defaultRunId = opts.runId ?? defaultRunIdFromPath(opts.filePath);

	const parsed = adapter.parse(content, { defaultAgentId, defaultRunId });

	const fallbackTs = Date.now();
	const startedAt =
		parsed.run.startedAt ??
		parsed.events[0]?.timestamp ??
		parsed.messages?.[0]?.timestamp ??
		fallbackTs;
	const endedAt =
		parsed.run.endedAt !== undefined
			? parsed.run.endedAt
			: (parsed.events.at(-1)?.timestamp ?? parsed.messages?.at(-1)?.timestamp ?? startedAt);

	const run: Run = {
		id: defaultRunId,
		agentId: defaultAgentId,
		status: parsed.run.status ?? "completed",
		startedAt,
		endedAt,
		metadata: parsed.run.metadata ?? {},
	};

	const storeOpts: StoreOptions = {};
	if (opts.dbPath) storeOpts.dbPath = opts.dbPath;
	const store = new Store(storeOpts);
	try {
		store.createRunWithEvents(run, parsed.events);
		const messages = parsed.messages ?? [];
		if (messages.length > 0) {
			store.appendMessages(defaultRunId, messages);
		}
		return {
			runId: defaultRunId,
			eventCount: parsed.events.length,
			messageCount: messages.length,
		};
	} finally {
		store.close();
	}
}
