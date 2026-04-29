---
title: Installation
description: Install the kovar MCP server in Claude Code, Cursor, Codex, or any MCP client
---

The kovar MCP server is shipped as part of the `@orlalabs/kovar` npm package. It speaks MCP over stdio, so any compatible host can launch it.

## Prerequisites

- Node 18 or later
- An MCP-capable host (Claude Code, Cursor, Codex, Antigravity, or any client that speaks the [MCP](https://modelcontextprotocol.io/) stdio protocol)

The package ships compiled JavaScript — no source build is required on install.

## Install styles

There are two ways to launch the server.

### One-shot via npx

```bash
npx -y @orlalabs/kovar mcp
```

Convenient for trying things out. Caveat: a cold npm cache will compile `better-sqlite3` from source, which can take 30–60 seconds and may time out an MCP host's `initialize` handshake. Run it once standalone before pointing a host at it.

### Global install

```bash
npm i -g @orlalabs/kovar
kovar mcp
```

Recommended for stable use — the binary is on `PATH` and starts instantly.

## Per-host configuration

The server reads stdio. The `command` and `args` fields below are what every host config needs; the surrounding shape varies by host.

### Claude Code

Either the project-local `.mcp.json` or the user-global config:

```json
{
  "mcpServers": {
    "kovar": {
      "command": "kovar",
      "args": ["mcp"]
    }
  }
}
```

Or, if you prefer not to install globally:

```json
{
  "mcpServers": {
    "kovar": {
      "command": "npx",
      "args": ["-y", "@orlalabs/kovar", "mcp"]
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kovar": {
      "command": "kovar",
      "args": ["mcp"]
    }
  }
}
```

### Codex / Antigravity / generic MCP client

Any host that launches a stdio MCP server works. The shape of its config varies, but the launch command is the same: `kovar mcp` (global install) or `npx -y @orlalabs/kovar mcp` (one-shot).

## DB path override

By default the server writes to `~/.kovar/runs.db`. Override with either:

- The `KOVAR_DB_PATH` environment variable
- The `--db-path <path>` CLI flag (wins over the env var)

The path `:memory:` opens an in-process SQLite database — useful for tests, useless across server restarts.

## Verifying it works

Send a `tools/list` request and confirm 15 tools come back:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | kovar mcp
```

Or via Node:

```typescript
import { spawn } from "node:child_process";

const child = spawn("kovar", ["mcp"]);
child.stdin.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
child.stdout.on("data", (b) => console.log(b.toString()));
```

You should see `record_run`, `append_events`, eight `assert_*` tools, `replay_run`, `diff_runs`, `record_canonical`, `get_run`, and `list_runs`.

## Related

- [Storage & Schema](/mcp/storage/) — the SQLite layout the server writes to.
- [Recording Tools](/mcp/tools/recording/) — first tools to call.
- [MCP Proxy](/mcp/auto-capture/proxy/) — capture another harness's traffic.
