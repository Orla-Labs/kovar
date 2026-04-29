---
title: Inspection
description: Fetch and list recorded runs
---

Two read-only tools. Use `list_runs` to find what's in the store, then `get_run` to pull a specific run plus its events.

## `get_run`

Fetch a recorded run with its full event stream.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | yes | Run to fetch. Errors with `RUN_NOT_FOUND` if absent. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `run` | object | `{ id, agentId, status, startedAt, endedAt, metadata }`. Field names use camelCase. |
| `events` | array | Wire-format events: `{ seq, tool_name, args, result, cost_usd, tokens_in, tokens_out, timestamp }`. |

Note: messages are not returned by `get_run`. They live in their own table — query the DB directly with `sqlite3` if you need them, or use `assert_messages_match`.

### Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"get_run",
  "arguments":{"run_id":"run-001"}
}}
```

Response:

```json
{
  "run": {
    "id": "run-001",
    "agentId": "researcher",
    "status": "completed",
    "startedAt": 1714200000000,
    "endedAt": 1714200002000,
    "metadata": { "task": "summarize-pr" }
  },
  "events": [
    { "seq": 0, "tool_name": "git_diff", "args": {"sha":"abc123"}, "result": "diff --git ...", "cost_usd": 0, "tokens_in": null, "tokens_out": null, "timestamp": 1714200000000 },
    { "seq": 1, "tool_name": "llm_summarize", "args": {"model":"sonnet"}, "result": null, "cost_usd": 0.012, "tokens_in": 3200, "tokens_out": 420, "timestamp": 1714200002000 }
  ]
}
```

## `list_runs`

List runs newest-first, optionally filtered by `agent_id`. Returns metadata only — no events.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | string | no | Filter by agent. Omit to list all runs. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `runs` | array | Run records, ordered by `started_at DESC`. Each: `{ id, agentId, status, startedAt, endedAt, metadata }`. |

### Example

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"list_runs",
  "arguments":{"agent_id":"researcher"}
}}
```

Response:

```json
{
  "runs": [
    { "id": "run-099", "agentId": "researcher", "status": "completed", "startedAt": 1714286400000, "endedAt": 1714286407000, "metadata": {} },
    { "id": "run-001", "agentId": "researcher", "status": "completed", "startedAt": 1714200000000, "endedAt": 1714200002000, "metadata": { "task": "summarize-pr" } }
  ]
}
```

## Related

- [Storage & Schema](/mcp/storage/) — querying the DB directly via `sqlite3`.
- [Recording Tools](/mcp/tools/recording/) — produce runs to inspect.
