---
title: Assertions
description: Eight assertion primitives for agent runs
---

Eight tools that read a run from the store and return `{ passed: bool, ... }`. Assertions never throw on a `false` result — failure is a value, not an error. They throw only on bad input (`INVALID_INPUT`) or a missing run (`RUN_NOT_FOUND`).

## `assert_tool_called`

Assert a tool was invoked. With `count`, requires exact equality; without, requires `>= 1`. With `args`, only events whose args contain those key/value pairs are counted (subset match, deep equality on values).

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | yes | Run to inspect. |
| `tool_name` | string | yes | Tool name to count. |
| `args` | object | no | Subset of args that must match. |
| `count` | integer | no | Exact required count. Without this, any positive count passes. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `passed` | bool | True if the run satisfies the assertion. |
| `tool_name` | string | Echo of input. |
| `actual_count` | integer | Number of matching events. |
| `expected_count` | integer \| null | Echo of `count`, or `null` when not specified. |

### Example

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"assert_tool_called",
  "arguments":{"run_id":"run-001","tool_name":"send_email","count":1}
}}
```

## `assert_no_drift`

Assert the run's tool sequence matches a recorded canonical. See [Canonicals](/mcp/tools/canonicals/) for how to record one.

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
| `diff` | array | Per-index entries where they differ: `{ index, expected, actual }`. |
| `canonical_name` | string | Echo of input. |

### Example

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"assert_no_drift",
  "arguments":{"run_id":"run-099","canonical_name":"happy-path"}
}}
```

## `assert_cost_under`

Sum of `cost_usd` across all events must be strictly less than the threshold.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | yes | Run to inspect. |
| `usd` | number | yes | Threshold in USD. Must be > 0. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `passed` | bool | True if total < threshold. |
| `total_cost_usd` | number | Sum of `cost_usd` across events (null values count as 0). |
| `threshold_usd` | number | Echo of input. |

## `assert_no_loops`

Sliding-window n-gram detector over the tool sequence. A loop is an n-gram of length 1..`window` that appears `max_repeat` or more times consecutively.

### Input

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `run_id` | string | yes | — | Run to inspect. |
| `max_repeat` | integer | no | `3` | Minimum number of consecutive repeats to flag. |
| `window` | integer | no | `5` | Maximum n-gram length to scan for. |
| `tool_name` | string | no | — | If present, only counts consecutive runs of this single tool (n=1). |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `passed` | bool | True if no loop was detected. |
| `loops` | array | Each entry: `{ tool_names: string[], start_seq: int, length: int, repeats: int }`. |

### Example

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
  "name":"assert_no_loops",
  "arguments":{"run_id":"run-001","max_repeat":3,"window":5}
}}
```

## `assert_token_budget_per_step`

Per-event check: `tokens_in + tokens_out` must not exceed `max_tokens_per_event`. Null token values count as 0. Filter to one tool with `tool_name`.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | yes | Run to inspect. |
| `max_tokens_per_event` | integer | yes | Per-event token ceiling (>= 1). |
| `tool_name` | string | no | Only check events for this tool. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `passed` | bool | True if no event exceeded the budget. |
| `max_tokens_per_event` | integer | Echo of input. |
| `violations` | array | Each entry: `{ seq, tool_name, tokens_in, tokens_out, total }`. |

## `assert_messages_match`

Match the run's recorded messages against an ordered list of constraints. Each expected entry can specify any combination of `role`, `contains`, `equals`, `matches`. `matches` is a JavaScript regex source string — bad regex returns `INVALID_INPUT` with `errors[0].path = "expected[N].matches"`.

`strict: true` requires equal length and 1:1 index alignment. Default (`strict: false`) allows extra trailing actual messages.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | yes | Run to inspect. |
| `expected` | array | yes | Constraint list. See below. |
| `strict` | bool | no | Defaults to `false`. |

Constraint shape:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | If present, the actual message's role must equal this. |
| `contains` | string | If present, actual content must include this substring. |
| `equals` | string | If present, actual content must match exactly. |
| `matches` | string | If present, actual content must match this regex. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `passed` | bool | True if all constraints satisfied. |
| `diff` | array | Per-index failures: `{ index, expected, actual, reason }`. In strict mode with a length mismatch, a single entry with `index: -1` is returned. |

### Example

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{
  "name":"assert_messages_match",
  "arguments":{
    "run_id":"run-001",
    "expected":[
      {"role":"user","contains":"refund"},
      {"role":"assistant","matches":"^I can help"}
    ]
  }
}}
```

## `assert_tool_order`

Assert that a sequence of tool names appears in the run.

- `contiguous: false` (default): subsequence match — names appear in order, with anything allowed between them.
- `contiguous: true`: consecutive match — the names appear back-to-back at some position.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | yes | Run to inspect. |
| `sequence` | string[] | yes | Ordered tool names (>= 1 item). |
| `contiguous` | bool | no | Defaults to `false`. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `passed` | bool | True if the sequence was found. |
| `matched_indices` | integer[] | Indices in the run where each element matched. |
| `missing_at` | integer \| null | Index in the input `sequence` that could not be matched, or `null` on success. |

## `assert_latency_under`

Total wall-time and/or per-event latency budget. Wall-time is `last_event.timestamp - first_event.timestamp`. Per-event latency is the gap to the next event (the final event has duration 0).

At least one of `max_total_ms` or `max_per_event_ms` must be supplied — omitting both returns `INVALID_INPUT`.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | yes | Run to inspect. |
| `max_total_ms` | integer | one-of | Total wall-time ceiling. |
| `max_per_event_ms` | integer | one-of | Per-event gap ceiling. |
| `tool_name` | string | no | If present, per-event check only applies to this tool. |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `passed` | bool | True if neither threshold was exceeded. |
| `total_ms` | integer | Wall-time of the run. |
| `max_total_ms` | integer \| null | Echo of input. |
| `max_per_event_ms` | integer \| null | Echo of input. |
| `slowest` | array | Top 5 slowest events: `{ seq, tool_name, duration_ms }`. |

### Example

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{
  "name":"assert_latency_under",
  "arguments":{"run_id":"run-001","max_total_ms":30000,"max_per_event_ms":5000}
}}
```

## Related

- [Recording Tools](/mcp/tools/recording/) — produce the runs these tools read.
- [Canonicals](/mcp/tools/canonicals/) — pair with `assert_no_drift`.
- [Recipes](/mcp/recipes/) — end-to-end assertion patterns.
- [Error Codes](/mcp/error-codes/) — what each non-pass error means.
