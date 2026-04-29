---
title: MCP Proxy
description: Capture any harness's tool calls by proxying its MCP server
---

Modern agent harnesses (Claude Code, Cursor, Codex, Antigravity, custom) talk to their tools over MCP. `kovar mcp proxy` sits between the harness and the real MCP server: every byte passes through unchanged, but kovar snoops `tools/call` requests and their responses at the protocol layer and writes them to the same SQLite store as `record_run`.

The result: zero-instrumentation capture of any harness's tool traffic.

## Command

```bash
kovar mcp proxy [options] <command> [args...]
```

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `--agent-id` | string | Agent id stored on the run. | `proxy` |
| `--run-id` | string | Run id to use. | Auto-generated `proxy-<ms>-<rand>` |
| `--db-path` | string | Override SQLite path. | `~/.kovar/runs.db` (or `KOVAR_DB_PATH`) |

Everything after the options is the child command — its name and args are spawned verbatim.

## Examples

Proxy a published MCP server:

```bash
kovar mcp proxy --agent-id research-bot npx -y @some/mcp-server
```

Proxy a local Node script:

```bash
kovar mcp proxy --run-id today-001 node ./tools/my-server.js --port 0
```

Override the DB to keep proxy runs separate:

```bash
kovar mcp proxy --db-path /tmp/proxy-runs.db npx -y @some/mcp-server
```

## How it works

The proxy is byte-exact: stdin from the parent is forwarded to the child's stdin, child stdout is forwarded to parent stdout, child stderr to parent stderr. The proxy *also* watches both directions line-by-line, parses each as JSON, and snoops:

- Parent → child: `{"method":"tools/call","id":...,"params":{"name":..., "arguments":...}}` requests are stashed by frame id.
- Child → parent: a response with the same `id` matches the stashed call and writes one event to the store with `tool_name`, `args`, and `result`.

Errors (responses without `result`) drop the pending entry silently — kovar does not record failed tool calls. Malformed JSON lines on either side pass through without crashing the proxy.

## Run lifecycle

A `running` run is created at startup with `metadata: { mode: "proxy", child_command, child_args }`. On child exit, kovar updates `status`:

| Child exit | Status | Notes |
|------------|--------|-------|
| Code 0 | `completed` | `ended_at` set to now. |
| Non-zero | `failed` | `ended_at` set to now. |
| Killed by signal | `failed` | Non-zero exit code synthesized. |
| Spawn error | `failed` | Logged to stderr, exit code 1. |

Auto-generated run id format: `proxy-<unix-ms>-<8-hex>`.

## Signal handling

`SIGINT` and `SIGTERM` are forwarded to the child once. A second signal escalates to `SIGKILL`. The proxy exits with the same status code as the child.

## What it captures

Tool calls only. Specifically: any JSON-RPC frame whose `method` is `tools/call`. The harness ↔ model conversation (LLM messages, prompts, completions) is not visible to the MCP server, so the proxy can't see it either.

For message capture, use `kovar ingest` with a harness-specific adapter — see [File Ingest](/mcp/auto-capture/ingest/).

## Limitations

- Only captures `tools/call`. Resource reads, prompt fetches, and other MCP methods are not recorded.
- A run records one transport. If the harness connects to multiple MCP servers, run kovar in front of each one (each gets its own run id).
- `cost_usd`, `tokens_in`, `tokens_out` are not populated — the protocol doesn't carry them. Use `record_run`/`append_events` directly if you need cost data.

## Related

- [File Ingest](/mcp/auto-capture/ingest/) — import session files after the fact.
- [Writing Adapters](/mcp/auto-capture/adapters/) — add support for a new harness format.
- [Recording Tools](/mcp/tools/recording/) — the in-process API the proxy writes through.
