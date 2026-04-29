---
title: Canonicals
description: Pin a happy path and detect drift
---

A canonical is a named tool sequence pinned from one or more clean runs. After it's recorded, future runs can be checked against it with `assert_no_drift`. Drift is sequence-only: only the order and identity of `tool_name` matters; args, costs, and timestamps are ignored.

## Workflow

1. Run the agent until you have one or more runs you trust.
2. Call `record_canonical` with those `run_ids` and a name.
3. On every subsequent run, call `assert_no_drift` with the same name.

If you pass multiple `run_ids` to `record_canonical`, they must all share the same tool sequence — otherwise the call errors with `SEQUENCE_MISMATCH`. This is intentional: the canonical is a single sequence, not a set.

## `record_canonical`

Upserts a canonical by name. Re-recording with the same name overwrites the previous sequence.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Canonical name. Choose something stable per agent + path (e.g. `support-bot:happy-path`). |
| `run_ids` | string[] | yes | One or more existing run ids (>= 1 item). All must share the same tool sequence. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Echo of input. |
| `tool_sequence` | string[] | The pinned sequence (taken from the first run). |
| `source_run_count` | integer | Number of runs that contributed. |
| `created_at` | integer | Millisecond epoch when the canonical was recorded. |

### Errors

| Code | Cause |
|------|-------|
| `RUN_NOT_FOUND` | One of the `run_ids` does not exist in the store. |
| `INVALID_INPUT` | `run_ids` was empty (the schema requires `minItems: 1`, but a runtime check guards the same case). |
| `SEQUENCE_MISMATCH` | Two of the input runs disagree on tool sequence. |

### Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"record_canonical",
  "arguments":{
    "name":"support-bot:happy-path",
    "run_ids":["run-2026-04-28-001","run-2026-04-28-002"]
  }
}}
```

Response:

```json
{
  "name": "support-bot:happy-path",
  "tool_sequence": ["search_docs", "fetch_user", "send_email"],
  "source_run_count": 2,
  "created_at": 1714200000000
}
```

## `assert_no_drift`

Read-only — never mutates the canonical. Returns the diff inline, so the agent can introspect on failure without a second call.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | yes | Run to check. |
| `canonical_name` | string | yes | Name of a previously recorded canonical. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `passed` | bool | True if the sequences match. |
| `matched` | bool | Same as `passed`. |
| `expected` | string[] | The canonical's tool sequence. |
| `actual` | string[] | The run's tool sequence. |
| `diff` | array | Per-index entries where they differ: `{ index, expected, actual }`. Either side can be `null` if one sequence is shorter. |
| `canonical_name` | string | Echo of input. |

### Errors

| Code | Cause |
|------|-------|
| `RUN_NOT_FOUND` | `run_id` does not exist. |
| `CANONICAL_NOT_FOUND` | `canonical_name` was never recorded. |

### Example

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"assert_no_drift",
  "arguments":{
    "run_id":"run-2026-04-28-099",
    "canonical_name":"support-bot:happy-path"
  }
}}
```

Drifted response:

```json
{
  "passed": false,
  "matched": false,
  "expected": ["search_docs", "fetch_user", "send_email"],
  "actual": ["search_docs", "fetch_user", "fetch_user", "send_email"],
  "diff": [
    { "index": 2, "expected": "send_email", "actual": "fetch_user" },
    { "index": 3, "expected": null, "actual": "send_email" }
  ],
  "canonical_name": "support-bot:happy-path"
}
```

## Related

- [Recipes](/mcp/recipes/) — pin-a-happy-path recipe.
- [Replay & Diff](/mcp/tools/replay-and-diff/) — `diff_runs` for richer comparisons (cost, latency, args).
- [Error Codes](/mcp/error-codes/) — `CANONICAL_NOT_FOUND`, `SEQUENCE_MISMATCH`.
