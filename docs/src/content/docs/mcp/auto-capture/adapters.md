---
title: Writing Adapters
description: Add a new harness format to kovar ingest
---

An adapter parses a harness's session file format into kovar's internal shape. Implement the `Adapter` interface, register it, and `kovar ingest --format <name>` will route to it.

## The interface

```typescript
import type { Adapter, AdapterContext, AdapterParseResult } from "@orlalabs/kovar";

interface Adapter {
  name: string;                                              // matches --format
  description: string;                                       // shown in adapter listings
  parse(content: string, ctx: AdapterContext): AdapterParseResult;
}

interface AdapterContext {
  defaultAgentId: string;   // from --agent-id or "ingest"
  defaultRunId: string;     // from --run-id or filename
}

interface AdapterParseResult {
  run: {
    startedAt?: number;
    endedAt?: number | null;
    status?: "running" | "completed" | "failed";
    metadata?: Record<string, unknown>;
  };
  events: EventInput[];
  messages?: MessageInput[];
}
```

## What `parse` returns

| Field | Type | Notes |
|-------|------|-------|
| `run.startedAt` | integer | Optional. Defaults to first event/message timestamp or `Date.now()`. |
| `run.endedAt` | integer \| null | Optional. Defaults to last event/message timestamp or `startedAt`. |
| `run.status` | enum | Optional. Defaults to `"completed"`. |
| `run.metadata` | object | Optional. Free-form. |
| `events` | array | Required. Each `EventInput` uses camelCase: `toolName`, `args`, `result`, `costUsd`, `tokensIn`, `tokensOut`, `timestamp`. |
| `messages` | array | Optional. Each `MessageInput`: `role`, `content`, `tokens`, `timestamp`. |

Critical: the adapter never sets `id` or `agentId` on the run. Both come from CLI flags (or kovar's defaults). The adapter's job is purely to translate file content to events/messages.

## Registration

The registry is in-process. Both built-ins register themselves at the bottom of `src/mcp/adapters/index.ts`:

```typescript
import { claudeCodeAdapter } from "./claude-code.js";
import { kovarJsonlAdapter } from "./kovar-jsonl.js";

registerAdapter(kovarJsonlAdapter);
registerAdapter(claudeCodeAdapter);
```

To add a new adapter, drop a file under `src/mcp/adapters/your-format.ts`, export a constant of type `Adapter`, and add a `registerAdapter(yourAdapter)` line.

## Reference implementation

The `kovar-jsonl` adapter is ~30 lines of real logic. Skim `src/mcp/adapters/kovar-jsonl.ts` for the full picture; the spine:

```typescript
export const kovarJsonlAdapter: Adapter = {
  name: "kovar-jsonl",
  description: "Default kovar JSONL format (run/event/message lines).",
  parse(content, _ctx) {
    const events: EventInput[] = [];
    const messages: MessageInput[] = [];
    let runLine: RunLine | undefined;

    for (const [i, raw] of content.split("\n").entries()) {
      const trimmed = raw.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
      const parsed = parseLine(trimmed, i + 1);
      if (parsed.type === "run") runLine = parsed;
      else if (parsed.type === "event") events.push(eventFromLine(parsed));
      else messages.push(messageFromLine(parsed));
    }

    return buildResult(runLine, events, messages);
  },
};
```

`parseLine` validates the line shape and throws `kovar-jsonl: invalid JSON on line N: ...` style errors with line numbers. Keep error messages prefixed with the adapter name so users know who threw.

## Distribution

Today the registry is in-process. New adapters must be added to the kovar source tree and shipped in a kovar release. A pull request that adds a single file under `src/mcp/adapters/` plus a `registerAdapter` line is enough — the layout follows `kovar-jsonl.ts` and `claude-code.ts`.

A future release may expose adapter loading via Node's resolver so they can ship as separate npm packages. Until then: PRs welcome.

## Candidates worth adding

| Format | Where it lives |
|--------|----------------|
| Cursor session files | Cursor's local cache (path TBD per platform) |
| Codex transcripts | `~/.codex/<session>.json` (or whatever the GA layout is) |
| OpenAI Agents SDK traces | OTel-shaped exporter output |
| Generic OpenTelemetry GenAI spans | Anything emitting the GenAI semantic conventions |

If you're building one, model the public adapter file after `claude-code.ts` — it shows the messy real-world cases (mixed string/array `content`, `tool_use_id` matching across lines, lenient JSON parsing).

## Related

- [File Ingest](/mcp/auto-capture/ingest/) — using existing adapters.
- [MCP Proxy](/mcp/auto-capture/proxy/) — live capture instead of file import.
- [Storage & Schema](/mcp/storage/) — the shape adapters write into.
