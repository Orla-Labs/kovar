---
title: Recording Tools
description: record_run and append_events
---

Two tools write run data into the store. `record_run` creates a new run; `append_events` extends an existing one. Both are atomic — the SQLite transaction wraps the entire write.

## `record_run`

Create a new run with its events and (optional) messages. Errors with `RUN_DUPLICATE` if `run_id` already exists; in that case use `append_events` instead.

### Input

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `agent_id` | string | yes | — | Logical agent identifier (used by `list_runs --agent_id`). |
| `run_id` | string | yes | — | Caller-chosen unique id for this run. |
| `metadata` | object | no | `{}` | Free-form JSON metadata persisted with the run. |
| `events` | array | no | `[]` | Tool-call events. See event shape below. |
| `messages` | array | no | `[]` | Conversational messages. See message shape below. |
| `status` | enum | no | `"completed"` | One of `"running"`, `"completed"`, `"failed"`. |

Event shape:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_name` | string | yes | Name of the tool that was called. |
| `args` | object | no | Arguments the tool received. Defaults to `{}`. |
| `result` | any | no | Tool's return value. Stored as JSON. Null if absent. |
| `cost_usd` | number | no | Cost of this step in USD (>= 0). |
| `tokens_in` | integer | no | Input tokens consumed (>= 0). |
| `tokens_out` | integer | no | Output tokens emitted (>= 0). |
| `timestamp` | integer | yes | Millisecond epoch. |

Message shape:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | yes | E.g. `"user"`, `"assistant"`, `"system"`. |
| `content` | string | yes | Message content (concatenated text). |
| `tokens` | integer | no | Token count for this message. |
| `timestamp` | integer | yes | Millisecond epoch. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | string | The id that was stored. |
| `event_count` | integer | Number of events persisted. |
| `message_count` | integer | Number of messages persisted. |
| `status` | string | The final run status. |

### Notes

- The write is one SQLite transaction. Either every row commits or nothing does.
- Sequence numbers (`seq`) are assigned in input order, starting at 0.
- Calling `record_run` twice with the same `run_id` errors. Use `append_events` to extend.
- If `events` is empty, `started_at` and `ended_at` both default to `Date.now()`.

### Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"record_run",
  "arguments":{
    "agent_id":"researcher",
    "run_id":"run-001",
    "metadata":{"task":"summarize-pr"},
    "events":[
      {"tool_name":"git_diff","args":{"sha":"abc123"},"result":"diff --git ...","cost_usd":0,"timestamp":1714200000000},
      {"tool_name":"llm_summarize","args":{"model":"sonnet"},"cost_usd":0.012,"tokens_in":3200,"tokens_out":420,"timestamp":1714200002000}
    ],
    "status":"completed"
  }
}}
```

Response:

```json
{ "run_id": "run-001", "event_count": 2, "message_count": 0, "status": "completed" }
```

## `append_events`

Append events (and optionally messages) to a run that already exists. Useful for streaming captures during long sessions, or for moving a `running` run to `completed` once it's done.

### Input

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `run_id` | string | yes | — | Existing run id. Errors with `RUN_NOT_FOUND` if absent. |
| `events` | array | yes | — | Events to append. Same shape as `record_run`. |
| `messages` | array | no | `[]` | Messages to append. Same shape as `record_run`. |
| `status` | enum | no | unchanged | If supplied, updates run status. `"completed"`/`"failed"` set `ended_at = now`. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | string | The run that was updated. |
| `appended_event_count` | integer | Number of events added. |
| `appended_message_count` | integer | Number of messages added. |
| `total_event_count` | integer | Total events in the run after the append. |

### Notes

- `seq` continues from `MAX(seq) + 1`. Concurrent appends to the same run on a single connection are safe.
- `record_run` errors if the run exists; `append_events` errors if it does not. The asymmetry is deliberate.

### Example

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"append_events",
  "arguments":{
    "run_id":"run-001",
    "events":[
      {"tool_name":"post_comment","args":{"pr":42},"timestamp":1714200005000}
    ],
    "status":"completed"
  }
}}
```

Response:

```json
{ "run_id": "run-001", "appended_event_count": 1, "appended_message_count": 0, "total_event_count": 3 }
```

## Related

- [Assertions](/mcp/tools/assertions/) — assert on what was just recorded.
- [Inspection](/mcp/tools/inspection/) — `get_run` and `list_runs`.
- [Error Codes](/mcp/error-codes/) — `RUN_DUPLICATE`, `RUN_NOT_FOUND`.
