---
title: Error Codes
description: Structured error responses from the kovar MCP server
---

Every kovar tool returns a structured error on failure. The MCP envelope is the standard `{ isError: true, content: [{ type: "text", text: "..." }] }`, where the `text` payload is a JSON string with this shape:

```typescript
{
  code: "INVALID_INPUT" | "RUN_NOT_FOUND" | ...,
  message: string,
  errors?: { path: string; message: string }[],   // present on validation failures
  hint?: string                                   // human-readable next step
}
```

Validation responses include up to 3 entries in `errors` (additional violations are dropped to keep responses small). Each entry uses a JSON-path-like locator: `expected[2].matches`, `events[0].timestamp`, etc.

## Codes

| Code | When | How to fix |
|------|------|------------|
| `INVALID_INPUT` | Args fail schema validation, or a tool reports a runtime constraint violation (bad regex in `assert_messages_match`, neither `max_total_ms` nor `max_per_event_ms` in `assert_latency_under`, empty `run_ids` in `record_canonical`). | Check the tool's `inputSchema` from `tools/list`. Inspect `errors[].path` for the offending field. |
| `RUN_NOT_FOUND` | A `run_id` referenced by the tool does not exist in the store. | Call `record_run` first, or use `list_runs` to find existing ids. |
| `RUN_DUPLICATE` | `record_run` was called with a `run_id` that already exists. | Use `append_events` to extend the existing run, or pick a different `run_id`. |
| `CANONICAL_NOT_FOUND` | `assert_no_drift` referenced a canonical `name` that has not been recorded. | Call `record_canonical` first, or pass a different name. |
| `CANONICAL_EXISTS` | Reserved. (Today `record_canonical` upserts by name; this code is reserved for future stricter modes.) | n/a |
| `SEQUENCE_MISMATCH` | `record_canonical` was given multiple `run_ids` whose tool sequences don't match. | Either record all source runs cleanly first, or pass a single `run_id`. |
| `INTERNAL` | Anything else: a SQLite constraint, a JSON parse failure, an unexpected exception. | The `message` carries the underlying error string. File an issue if it's reproducible. |

## Example

A `record_run` call with a missing required field:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"record_run",
  "arguments":{"run_id":"run-001"}
}}
```

Returns:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"code\":\"INVALID_INPUT\",\"message\":\"Input validation failed\",\"errors\":[{\"path\":\"agent_id\",\"message\":\"is required\"}],\"hint\":\"Check the tool's inputSchema for required fields and types.\"}"
  }]
}
```

After parsing the inner JSON:

```json
{
  "code": "INVALID_INPUT",
  "message": "Input validation failed",
  "errors": [{ "path": "agent_id", "message": "is required" }],
  "hint": "Check the tool's inputSchema for required fields and types."
}
```

## Related

- [Recording Tools](/mcp/tools/recording/) — `RUN_DUPLICATE` and `RUN_NOT_FOUND` semantics.
- [Canonicals](/mcp/tools/canonicals/) — `SEQUENCE_MISMATCH` semantics.
- [Assertions](/mcp/tools/assertions/) — runtime `INVALID_INPUT` cases.
