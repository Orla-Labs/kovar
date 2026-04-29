---
title: Storage & Schema
description: SQLite layout, migrations, and where kovar persists run data
---

Kovar writes every recorded run to a single SQLite file. There is no separate config, no index server, no remote sync. Delete the file and kovar forgets everything.

## DB path

| Source | Value | Wins |
|--------|-------|------|
| Default | `~/.kovar/runs.db` | (fallback) |
| `KOVAR_DB_PATH` env var | path string | over default |
| `--db-path <path>` CLI flag | path string | over env var |

The special path `:memory:` opens an in-process database that vanishes on shutdown.

## Concurrency

WAL mode is enabled on connect (`PRAGMA journal_mode = WAL`). Multiple MCP clients can read the database concurrently; writes serialize on a single connection per process. `PRAGMA foreign_keys = ON` is also set so cascading deletes work.

## Tables

Five tables. Created with `CREATE TABLE IF NOT EXISTS` on first connect, then forward-migrated.

### `runs`

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,           -- running | completed | failed
  started_at INTEGER NOT NULL,    -- ms epoch
  ended_at INTEGER,               -- ms epoch, nullable while running
  metadata TEXT NOT NULL DEFAULT '{}'  -- JSON
);
CREATE INDEX idx_runs_agent_id ON runs(agent_id);
```

### `events`

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '{}',  -- JSON
  result TEXT,                       -- JSON, nullable
  cost_usd REAL,
  tokens_in INTEGER,                 -- added in v0.6.0
  tokens_out INTEGER,                -- added in v0.6.0
  timestamp INTEGER NOT NULL,
  UNIQUE(run_id, seq)
);
CREATE INDEX idx_events_run_id ON events(run_id);
```

### `messages`

Added in v0.6.0. Optional per-run conversational transcript, stored alongside events.

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens INTEGER,
  timestamp INTEGER NOT NULL,
  UNIQUE(run_id, seq)
);
CREATE INDEX idx_messages_run_id ON messages(run_id);
```

### `canonicals`

```sql
CREATE TABLE canonicals (
  name TEXT PRIMARY KEY,
  tool_sequence TEXT NOT NULL,    -- JSON array of tool names
  created_at INTEGER NOT NULL
);
```

### `meta`

Added in v0.6.0. Stores schema version (and forward-compatible scratch keys).

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Schema versioning

The `meta` table tracks `schema_version`. On `Store` construction, kovar reads the current version and applies any pending migrations forward in a transaction. v0.5.0 → v0.6.0 added `tokens_in` / `tokens_out` columns on `events`, the `messages` table, and the `meta` table itself.

You don't need to do anything to upgrade — opening an older database with a newer kovar will migrate it on the first connect.

## Inspecting the DB

The standard `sqlite3` CLI works. Some useful queries:

```bash
sqlite3 ~/.kovar/runs.db
```

```sql
-- List recent runs:
SELECT id, agent_id, status, started_at FROM runs ORDER BY started_at DESC LIMIT 20;

-- Dump events for one run:
SELECT seq, tool_name, cost_usd, tokens_in, tokens_out FROM events
WHERE run_id = 'run-001' ORDER BY seq;

-- Total spend per agent:
SELECT r.agent_id, SUM(e.cost_usd) AS spend
FROM runs r JOIN events e ON e.run_id = r.id
GROUP BY r.agent_id ORDER BY spend DESC;
```

## Resetting

Stop the server and delete the file:

```bash
rm ~/.kovar/runs.db ~/.kovar/runs.db-wal ~/.kovar/runs.db-shm
```

Nothing else stores state.

## Related

- [Installation](/mcp/installation/) — pointing kovar at a custom DB path.
- [Inspection Tools](/mcp/tools/inspection/) — `get_run` and `list_runs` over MCP.
