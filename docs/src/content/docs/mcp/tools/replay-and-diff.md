---
title: Replay & Diff
description: Re-run sessions and compare runs
---

Two tools for working with recorded runs: `replay_run` returns the event stream so the agent can re-execute it client-side; `diff_runs` produces a structured comparison between two runs.

## `replay_run`

Returns the recorded events for a run, optionally starting from a given seq, with optional per-tool result substitution.

### Input

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `run_id` | string | yes | — | Run to replay. |
| `from_seq` | integer | no | `0` | Starting `seq` (>= 0). Preferred over `from_event_id`. |
| `from_event_id` | integer | no | — | Deprecated alias for `from_seq`. Kept for back-compat. |
| `substitute` | object | no | `{}` | Map of `tool_name -> canned result`. Matching events have their `result` replaced with a deep clone. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | string | Echo of input. |
| `events` | array | Wire-format events: `{ seq, tool_name, args, result, cost_usd, tokens_in, tokens_out, timestamp }`. |

### Notes

- `substitute` matches by exact `tool_name`. If a key isn't present, the recorded `result` passes through.
- The substituted value is deep-cloned per event, so mutating the response in the agent doesn't poison subsequent events.
- New in v0.6.0: `from_seq` and `substitute`. The old `from_event_id` is honored when `from_seq` is absent.

### Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"replay_run",
  "arguments":{
    "run_id":"run-001",
    "from_seq":0,
    "substitute":{
      "send_email":{"id":"mock-msg-1","status":"queued"}
    }
  }
}}
```

Response (abbreviated):

```json
{
  "run_id": "run-001",
  "events": [
    { "seq": 0, "tool_name": "search_docs", "args": {"q": "refund"}, "result": "...", "cost_usd": 0, "tokens_in": null, "tokens_out": null, "timestamp": 1714200000000 },
    { "seq": 1, "tool_name": "send_email", "args": {"to": "u@x.com"}, "result": {"id": "mock-msg-1", "status": "queued"}, "cost_usd": 0, "tokens_in": null, "tokens_out": null, "timestamp": 1714200004000 }
  ]
}
```

## `diff_runs`

Structured diff between two runs. Both must exist or you get `RUN_NOT_FOUND`.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id_a` | string | yes | First run (the "before"). |
| `run_id_b` | string | yes | Second run (the "after"). |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `tool_diff` | array | Per-index entries where the tool sequence differs: `{ index, a, b }`. |
| `cost_a_usd` | number | Total cost for run A. |
| `cost_b_usd` | number | Total cost for run B. |
| `cost_delta_usd` | number | `cost_b_usd - cost_a_usd`. |
| `latency_a_ms` | integer | Wall-time of run A. |
| `latency_b_ms` | integer | Wall-time of run B. |
| `latency_delta_ms` | integer | `latency_b_ms - latency_a_ms`. |
| `args_diff` | array | For events that share a `tool_name` at the same `seq`: top-level arg keys that were added/removed/changed. |

### Notes

- `args_diff` only inspects top-level keys. Nested object differences show up in `changed` if their root key's value differs (deep equality).
- Events past the shorter run's end appear in `tool_diff` with `a: null` or `b: null`.

### Example

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"diff_runs",
  "arguments":{"run_id_a":"run-001","run_id_b":"run-002"}
}}
```

Response:

```json
{
  "tool_diff": [
    { "index": 2, "a": "send_email", "b": "post_slack" }
  ],
  "cost_a_usd": 0.42,
  "cost_b_usd": 0.39,
  "cost_delta_usd": -0.03,
  "latency_a_ms": 8000,
  "latency_b_ms": 7100,
  "latency_delta_ms": -900,
  "args_diff": [
    { "seq": 0, "tool_name": "search_docs", "added": ["limit"], "removed": [], "changed": ["q"] }
  ]
}
```

## Related

- [Recording Tools](/mcp/tools/recording/) — produce runs to replay or diff.
- [Canonicals](/mcp/tools/canonicals/) — `assert_no_drift` is a sequence-only diff against a named baseline.
- [Recipes](/mcp/recipes/) — replay-with-substitution pattern.
