---
title: File Ingest
description: Import recorded sessions from JSONL files via pluggable adapters
---

`kovar ingest` reads a session file from disk, runs it through a registered adapter, and writes the parsed run + events + messages into the SQLite store. Useful for after-the-fact analysis of agent transcripts you didn't proxy live.

## Command

```bash
kovar ingest <file> --format <fmt> [options]
```

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `--format` | string | Adapter name. Required. | — |
| `--agent-id` | string | Agent id stored on the run. | `ingest` |
| `--run-id` | string | Run id. | Filename without extension |
| `--db-path` | string | Override SQLite path. | `~/.kovar/runs.db` (or `KOVAR_DB_PATH`) |

## Built-in adapters

| Name | Description |
|------|-------------|
| `kovar-jsonl` | Default kovar JSONL format (run/event/message lines). |
| `claude-code` | Claude Code session JSONL files. |

List them via `getAdapter` / `listAdapters` from `@orlalabs/kovar`'s programmatic API, or just try one and read the error message.

## `kovar-jsonl`

The native format. One JSON object per line. Empty lines and lines starting with `#` are ignored. Malformed JSON or unknown `type` values throw with the offending line number.

### Line types

```text
{ "type": "run",   "run_id"?: string, "agent_id"?: string, "started_at"?: int,
  "ended_at"?: int|null, "status"?: "running"|"completed"|"failed", "metadata"?: object }
  (zero or one allowed; if absent, defaults from ingest context are used)

{ "type": "event", "tool_name": string, "args"?: object, "result"?: any,
  "cost_usd"?: number|null, "tokens_in"?: int, "tokens_out"?: int, "timestamp": int }
  (zero or more)

{ "type": "message", "role": string, "content": string, "tokens"?: int,
  "timestamp": int }
  (zero or more)
```

### Sample file

```jsonl
# session.jsonl — kovar-jsonl format
{"type":"run","status":"completed","metadata":{"task":"summarize-pr"}}
{"type":"message","role":"user","content":"summarize PR 42","timestamp":1714200000000}
{"type":"event","tool_name":"git_diff","args":{"sha":"abc123"},"result":"diff --git ...","cost_usd":0,"timestamp":1714200000000}
{"type":"event","tool_name":"llm_summarize","args":{"model":"sonnet"},"cost_usd":0.012,"tokens_in":3200,"tokens_out":420,"timestamp":1714200002000}
{"type":"message","role":"assistant","content":"This PR refactors X.","tokens":420,"timestamp":1714200002000}
```

### Ingest

```bash
kovar ingest ./session.jsonl --format kovar-jsonl --agent-id researcher --run-id session-2026-04-28
```

Output:

```text
  ✓ Ingested 2 events, 2 messages into run session-2026-04-28
```

## `claude-code`

Parses Claude Code session files at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`.

The adapter walks each line of the session file and maps Claude Code's content blocks:

| Block | Mapped to |
|-------|-----------|
| `tool_use` | One event (`tool_name = name`, `args = input`, timestamp from the assistant message). |
| `tool_result` | Updates the matching event's `result` (matched by `tool_use_id`). |
| Plain text user/assistant message | One message (role + flattened text content). |

```bash
kovar ingest ~/.claude/projects/-Users-me-myproject/abc-123.jsonl --format claude-code
```

The Claude Code session format is undocumented. This adapter targets the format observed as of April 2026 and may need updates as Claude Code evolves.

## Defaults

- If a `kovar-jsonl` file has no `run` line, kovar fills in `agent_id` from `--agent-id` (or `ingest`), and `run_id` from `--run-id` (or the filename minus extension).
- `started_at` and `ended_at` default to the first/last event or message timestamp; if there are none, they default to `Date.now()`.
- The run is always created in one transaction with its events; messages are appended after.

## Programmatic ingest

```typescript
import { ingestFile } from "@orlalabs/kovar";

const result = await ingestFile({
  filePath: "./session.jsonl",
  format: "kovar-jsonl",
  agentId: "researcher",
  runId: "session-2026-04-28",
});
// { runId, eventCount, messageCount }
```

## Related

- [Writing Adapters](/mcp/auto-capture/adapters/) — add a format for another harness.
- [MCP Proxy](/mcp/auto-capture/proxy/) — capture live instead of from disk.
- [Storage & Schema](/mcp/storage/) — what's persisted.
