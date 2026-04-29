---
title: Recipes
description: Common patterns for using kovar in agent runs
---

End-to-end snippets showing how the tools compose. All payloads are valid JSON-RPC. Tool args use snake_case.

## Record then assert a tool was called

The agent runs, captures its tool calls into events, and then checks that the right tool fired the right number of times.

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"record_run",
  "arguments":{
    "agent_id":"support-bot",
    "run_id":"run-2026-04-28-001",
    "events":[
      {"tool_name":"search_docs","args":{"q":"refund policy"},"timestamp":1714200000000},
      {"tool_name":"send_email","args":{"to":"u@x.com"},"timestamp":1714200004000}
    ]
  }
}}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"assert_tool_called",
  "arguments":{
    "run_id":"run-2026-04-28-001",
    "tool_name":"send_email",
    "count":1
  }
}}
```

If `send_email` fired twice (e.g., a retry slipped through), the assertion returns `{ "passed": false, "actual_count": 2, "expected_count": 1 }`.

## Detect agent loops

`assert_no_loops` runs a sliding-window n-gram detector over the tool sequence. By default it flags any 1- to 5-gram pattern that repeats 3+ times consecutively.

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
  "name":"record_run",
  "arguments":{
    "agent_id":"flaky-agent",
    "run_id":"loop-demo",
    "events":[
      {"tool_name":"search","args":{},"timestamp":1714200000000},
      {"tool_name":"fetch","args":{},"timestamp":1714200001000},
      {"tool_name":"search","args":{},"timestamp":1714200002000},
      {"tool_name":"fetch","args":{},"timestamp":1714200003000},
      {"tool_name":"search","args":{},"timestamp":1714200004000},
      {"tool_name":"fetch","args":{},"timestamp":1714200005000}
    ]
  }
}}
```

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{
  "name":"assert_no_loops",
  "arguments":{"run_id":"loop-demo"}
}}
```

Returns:

```json
{
  "passed": false,
  "loops": [
    { "tool_names": ["search", "fetch"], "start_seq": 0, "length": 2, "repeats": 3 }
  ]
}
```

## Cost guardrails

Record events with `cost_usd`, `tokens_in`, `tokens_out`, then assert against a budget.

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{
  "name":"record_run",
  "arguments":{
    "agent_id":"researcher",
    "run_id":"costly-run",
    "events":[
      {"tool_name":"llm","args":{"model":"sonnet"},"cost_usd":0.42,"tokens_in":12000,"tokens_out":2000,"timestamp":1714200000000},
      {"tool_name":"llm","args":{"model":"sonnet"},"cost_usd":0.18,"tokens_in":4000,"tokens_out":900,"timestamp":1714200008000}
    ]
  }
}}
```

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{
  "name":"assert_cost_under",
  "arguments":{"run_id":"costly-run","usd":1.0}
}}
```

Pair it with a per-step token check:

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{
  "name":"assert_token_budget_per_step",
  "arguments":{"run_id":"costly-run","max_tokens_per_event":15000}
}}
```

`assert_token_budget_per_step` sums `tokens_in + tokens_out` per event; null values count as 0. Filter to a single tool with `tool_name`.

## Pin a happy path with canonicals

Record one or more clean runs, register their tool sequence as a named canonical, then assert future runs against that name.

```json
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{
  "name":"record_canonical",
  "arguments":{
    "name":"support-bot:happy-path",
    "run_ids":["run-2026-04-28-001"]
  }
}}
```

On a later run:

```json
{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{
  "name":"assert_no_drift",
  "arguments":{
    "run_id":"run-2026-04-28-099",
    "canonical_name":"support-bot:happy-path"
  }
}}
```

If the run drifted, the response includes the diff:

```json
{
  "passed": false,
  "matched": false,
  "expected": ["search_docs", "send_email"],
  "actual": ["search_docs", "search_docs", "send_email"],
  "diff": [
    { "index": 1, "expected": "send_email", "actual": "search_docs" },
    { "index": 2, "expected": null, "actual": "send_email" }
  ],
  "canonical_name": "support-bot:happy-path"
}
```

Passing multiple `run_ids` to `record_canonical` requires them all to share the same tool sequence — otherwise you get `SEQUENCE_MISMATCH`. See [Error Codes](/mcp/error-codes/).

## Replay with substitution

`replay_run` returns the recorded events as a stream the agent can re-execute client-side. The optional `substitute` map swaps a tool's recorded result for a canned value — useful for replacing an expensive or non-deterministic call with a mock.

```json
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{
  "name":"replay_run",
  "arguments":{
    "run_id":"run-2026-04-28-001",
    "from_seq":0,
    "substitute":{
      "send_email":{"id":"mock-msg-1","status":"queued"}
    }
  }
}}
```

Every event whose `tool_name` matches a key in `substitute` has its `result` replaced with a deep clone of the value. Unmatched events are returned unchanged.

## Related

- [Assertions](/mcp/tools/assertions/) — full reference for every `assert_*` tool.
- [Canonicals](/mcp/tools/canonicals/) — drift detection in depth.
- [Replay & Diff](/mcp/tools/replay-and-diff/) — substitution semantics and `diff_runs`.
