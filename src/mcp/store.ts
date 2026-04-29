import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database, { type Database as Db } from "better-sqlite3";
import { resolveDbPath } from "./paths.js";
import type { Canonical, Message, Run, ToolCallEvent } from "./types.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
	id TEXT PRIMARY KEY,
	agent_id TEXT NOT NULL,
	status TEXT NOT NULL,
	started_at INTEGER NOT NULL,
	ended_at INTEGER,
	metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS events (
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

CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id);

CREATE TABLE IF NOT EXISTS canonicals (
	name TEXT PRIMARY KEY,
	tool_sequence TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
`;

const MIGRATIONS: { version: number; sql: string }[] = [
	{
		version: 1,
		sql: `
ALTER TABLE events ADD COLUMN tokens_in INTEGER;
ALTER TABLE events ADD COLUMN tokens_out INTEGER;

CREATE TABLE IF NOT EXISTS messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	role TEXT NOT NULL,
	content TEXT NOT NULL,
	tokens INTEGER,
	timestamp INTEGER NOT NULL,
	UNIQUE(run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_messages_run_id ON messages(run_id);
`,
	},
];

export interface StoreOptions {
	dbPath?: string;
}

interface RunRow {
	id: string;
	agent_id: string;
	status: string;
	started_at: number;
	ended_at: number | null;
	metadata: string;
}

interface EventRow {
	id: number;
	run_id: string;
	seq: number;
	tool_name: string;
	args: string;
	result: string | null;
	cost_usd: number | null;
	tokens_in: number | null;
	tokens_out: number | null;
	timestamp: number;
}

interface CanonicalRow {
	name: string;
	tool_sequence: string;
	created_at: number;
}

interface MessageRow {
	id: number;
	run_id: string;
	seq: number;
	role: string;
	content: string;
	tokens: number | null;
	timestamp: number;
}

interface MetaRow {
	key: string;
	value: string;
}

function rowToRun(row: RunRow): Run {
	return {
		id: row.id,
		agentId: row.agent_id,
		status: row.status as Run["status"],
		startedAt: row.started_at,
		endedAt: row.ended_at,
		metadata: JSON.parse(row.metadata) as Record<string, unknown>,
	};
}

function rowToEvent(row: EventRow): ToolCallEvent {
	return {
		id: row.id,
		runId: row.run_id,
		seq: row.seq,
		toolName: row.tool_name,
		args: JSON.parse(row.args) as Record<string, unknown>,
		result: row.result === null ? null : (JSON.parse(row.result) as unknown),
		costUsd: row.cost_usd,
		tokensIn: row.tokens_in,
		tokensOut: row.tokens_out,
		timestamp: row.timestamp,
	};
}

function rowToCanonical(row: CanonicalRow): Canonical {
	return {
		name: row.name,
		toolSequence: JSON.parse(row.tool_sequence) as string[],
		createdAt: row.created_at,
	};
}

function rowToMessage(row: MessageRow): Message {
	return {
		id: row.id,
		runId: row.run_id,
		seq: row.seq,
		role: row.role,
		content: row.content,
		tokens: row.tokens,
		timestamp: row.timestamp,
	};
}

export type EventInput = Omit<ToolCallEvent, "id" | "seq" | "runId" | "tokensIn" | "tokensOut"> & {
	tokensIn?: number | null;
	tokensOut?: number | null;
};

export type MessageInput = Omit<Message, "id" | "seq" | "runId">;

export class Store {
	private readonly db: Db;

	constructor(options: StoreOptions = {}) {
		const path = options.dbPath ?? resolveDbPath();
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.pragma("journal_mode = WAL");
		this.db.pragma("foreign_keys = ON");
		this.db.exec(SCHEMA_SQL);
		this.runMigrations();
	}

	private runMigrations(): void {
		const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get("schema_version") as
			| MetaRow
			| undefined;
		const current = row ? Number.parseInt(row.value, 10) : 0;
		const setVersion = this.db.prepare(
			`INSERT INTO meta (key, value) VALUES ('schema_version', ?)
				ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		);
		for (const migration of MIGRATIONS) {
			if (migration.version <= current) continue;
			const apply = this.db.transaction(() => {
				this.db.exec(migration.sql);
				setVersion.run(String(migration.version));
			});
			apply();
		}
		if (current === 0 && MIGRATIONS.length === 0) {
			setVersion.run("0");
		}
	}

	close(): void {
		this.db.close();
	}

	createRun(run: Run): void {
		this.db
			.prepare(
				"INSERT INTO runs (id, agent_id, status, started_at, ended_at, metadata) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				run.id,
				run.agentId,
				run.status,
				run.startedAt,
				run.endedAt,
				JSON.stringify(run.metadata),
			);
	}

	createRunWithEvents(run: Run, events: EventInput[]): ToolCallEvent[] {
		const out: ToolCallEvent[] = [];
		const tx = this.db.transaction(() => {
			this.db
				.prepare(
					"INSERT INTO runs (id, agent_id, status, started_at, ended_at, metadata) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.run(
					run.id,
					run.agentId,
					run.status,
					run.startedAt,
					run.endedAt,
					JSON.stringify(run.metadata),
				);
			if (events.length === 0) return;
			const insert = this.db.prepare(
				"INSERT INTO events (run_id, seq, tool_name, args, result, cost_usd, tokens_in, tokens_out, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
			);
			let seq = 0;
			for (const e of events) {
				const inserted = insert.get(
					run.id,
					seq,
					e.toolName,
					JSON.stringify(e.args ?? {}),
					e.result === undefined ? null : JSON.stringify(e.result),
					e.costUsd,
					e.tokensIn ?? null,
					e.tokensOut ?? null,
					e.timestamp,
				) as EventRow;
				out.push(rowToEvent(inserted));
				seq++;
			}
		});
		tx();
		return out;
	}

	updateRunStatus(runId: string, status: Run["status"], endedAt?: number): void {
		this.db
			.prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?")
			.run(status, endedAt ?? null, runId);
	}

	getRun(runId: string): Run | null {
		const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
		return row ? rowToRun(row) : null;
	}

	listRuns(agentId?: string): Run[] {
		const rows = agentId
			? this.db
					.prepare("SELECT * FROM runs WHERE agent_id = ? ORDER BY started_at DESC")
					.all(agentId)
			: this.db.prepare("SELECT * FROM runs ORDER BY started_at DESC").all();
		return (rows as RunRow[]).map(rowToRun);
	}

	appendEvents(runId: string, events: EventInput[]): ToolCallEvent[] {
		if (events.length === 0) return [];
		const row = this.db
			.prepare("SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM events WHERE run_id = ?")
			.get(runId) as { next: number };
		const insert = this.db.prepare(
			"INSERT INTO events (run_id, seq, tool_name, args, result, cost_usd, tokens_in, tokens_out, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
		);
		const out: ToolCallEvent[] = [];
		const tx = this.db.transaction((items: EventInput[]) => {
			let seq = row.next;
			for (const e of items) {
				const inserted = insert.get(
					runId,
					seq,
					e.toolName,
					JSON.stringify(e.args ?? {}),
					e.result === undefined ? null : JSON.stringify(e.result),
					e.costUsd,
					e.tokensIn ?? null,
					e.tokensOut ?? null,
					e.timestamp,
				) as EventRow;
				out.push(rowToEvent(inserted));
				seq++;
			}
		});
		tx(events);
		return out;
	}

	getEvents(runId: string, fromSeq = 0): ToolCallEvent[] {
		const rows = this.db
			.prepare("SELECT * FROM events WHERE run_id = ? AND seq >= ? ORDER BY seq ASC")
			.all(runId, fromSeq);
		return (rows as EventRow[]).map(rowToEvent);
	}

	appendMessages(runId: string, messages: MessageInput[]): Message[] {
		if (messages.length === 0) return [];
		const row = this.db
			.prepare("SELECT COALESCE(MAX(seq), -1) + 1 AS next FROM messages WHERE run_id = ?")
			.get(runId) as { next: number };
		const insert = this.db.prepare(
			"INSERT INTO messages (run_id, seq, role, content, tokens, timestamp) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
		);
		const out: Message[] = [];
		const tx = this.db.transaction((items: MessageInput[]) => {
			let seq = row.next;
			for (const m of items) {
				const inserted = insert.get(
					runId,
					seq,
					m.role,
					m.content,
					m.tokens,
					m.timestamp,
				) as MessageRow;
				out.push(rowToMessage(inserted));
				seq++;
			}
		});
		tx(messages);
		return out;
	}

	getMessages(runId: string): Message[] {
		const rows = this.db
			.prepare("SELECT * FROM messages WHERE run_id = ? ORDER BY seq ASC")
			.all(runId);
		return (rows as MessageRow[]).map(rowToMessage);
	}

	upsertCanonical(canonical: Canonical): void {
		this.db
			.prepare(
				`INSERT INTO canonicals (name, tool_sequence, created_at) VALUES (?, ?, ?)
				ON CONFLICT(name) DO UPDATE SET tool_sequence = excluded.tool_sequence, created_at = excluded.created_at`,
			)
			.run(canonical.name, JSON.stringify(canonical.toolSequence), canonical.createdAt);
	}

	getCanonical(name: string): Canonical | null {
		const row = this.db.prepare("SELECT * FROM canonicals WHERE name = ?").get(name) as
			| CanonicalRow
			| undefined;
		return row ? rowToCanonical(row) : null;
	}
}
