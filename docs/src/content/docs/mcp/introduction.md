---
title: MCP Server
description: Local-first MCP server for asserting on agent runs
---

Kovar ships a local Model Context Protocol server that records agent runs to SQLite and exposes assertion + replay primitives back to the agent as MCP tools. The agent itself is the caller: it records what it just did, then asserts on it.

## The wedge

No SaaS. No auth. No cloud. Runs on your machine, writes to one SQLite file at `~/.kovar/runs.db` (override with `KOVAR_DB_PATH` env var or `--db-path` flag). Harness-agnostic — anything that speaks MCP over stdio works (Claude Code, Cursor, Codex, Antigravity, your own).

The server exposes 15 tools across six categories. The agent records a run, then calls `assert_*` tools to enforce post-conditions: "did you call X?", "did this stay under cost budget?", "did you loop?", "does this match the canonical happy path?".

## Quick example

A minimal record-then-assert flow over JSON-RPC:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"record_run",
  "arguments":{
    "agent_id":"my-agent",
    "run_id":"run-001",
    "events":[
      {"tool_name":"search","args":{"q":"kovar"},"timestamp":1714200000000},
      {"tool_name":"fetch","args":{"url":"https://example.com"},"timestamp":1714200001000}
    ]
  }
}}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"assert_tool_called",
  "arguments":{"run_id":"run-001","tool_name":"fetch","count":1}
}}
```

The server returns `{ "passed": true, "tool_name": "fetch", "actual_count": 1, "expected_count": 1 }`.

## What you can do

| Category | Tools | Reference |
|----------|-------|-----------|
| Recording | `record_run`, `append_events` | [Recording Tools](/mcp/tools/recording/) |
| Assertions | 8 `assert_*` tools | [Assertions](/mcp/tools/assertions/) |
| Replay & diff | `replay_run`, `diff_runs` | [Replay & Diff](/mcp/tools/replay-and-diff/) |
| Canonicals | `record_canonical`, `assert_no_drift` | [Canonicals](/mcp/tools/canonicals/) |
| Inspection | `get_run`, `list_runs` | [Inspection](/mcp/tools/inspection/) |
| Auto-capture | `kovar mcp proxy`, `kovar ingest` | [MCP Proxy](/mcp/auto-capture/proxy/), [File Ingest](/mcp/auto-capture/ingest/) |

## Next steps

- [Install](/mcp/installation/) the server in Claude Code, Cursor, or another MCP client.
- Read [Storage & Schema](/mcp/storage/) to understand what's persisted.
- Skim the [Recipes](/mcp/recipes/) for end-to-end patterns.
