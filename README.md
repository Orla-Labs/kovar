# Kovar

Security testing assertions + AI-powered test recording for Playwright. Add security checks to your E2E tests without being a security expert, and record browser sessions that generate production-grade Page Object Model tests.

## Install

```bash
npm install -D @orlalabs/kovar
```

## Quick Start

Replace your Playwright import with Kovar -- everything else stays the same. (The relative URL below needs `use: { baseURL: "http://localhost:3000" }` in your `playwright.config.ts`.)

```typescript
import { test, expect } from "@orlalabs/kovar"; // was: '@playwright/test'

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

Expect the first run to be red: the matcher fails on critical/high findings and prints a `Fix:` line for each. On plain `http://localhost`, add `{ skip: ["strict-transport-security"] }` (HSTS only applies over HTTPS). See the [Quick Start](https://kovar.orlalabs.com/getting-started/quick-start) for how to adopt it on an app with known gaps.

## Features

### Security Checks

- **[HTTP Headers](https://kovar.orlalabs.com/checks/headers)** -- 12 OWASP-aligned header checks with CSP validation
- **[Cookie Flags](https://kovar.orlalabs.com/checks/cookies)** -- session cookie security (Secure, HttpOnly, SameSite, prefix validation)
- **[Reflected XSS](https://kovar.orlalabs.com/checks/xss)** -- 40 polyglot payloads with API-first and DOM testing
- **[CSRF Protection](https://kovar.orlalabs.com/checks/csrf)** -- verifies state-changing endpoints reject tokenless requests
- **[CORS Configuration](https://kovar.orlalabs.com/checks/cors)** -- tests for origin reflection and wildcard misconfigurations
- **[Authentication](https://kovar.orlalabs.com/checks/auth)** -- verifies protected endpoints reject unauthenticated requests
- **[Accessibility](https://kovar.orlalabs.com/checks/accessibility)** -- *deprecated in 0.7, removed in 0.8; use [`@axe-core/playwright`](https://playwright.dev/docs/accessibility-testing)*

### Fixtures & API

- **[Security Fixture](https://kovar.orlalabs.com/api/fixture)** -- programmatic access to all checks with `assert()` and `check()` modes
- **[Full Audit](https://kovar.orlalabs.com/api/audit)** -- run all checks at once and get a structured report
- **[Standalone API](https://kovar.orlalabs.com/api/standalone)** -- use check functions outside the Playwright test runner

### Remediation

- **[Auto-Remediation](https://kovar.orlalabs.com/remediation/overview)** -- framework-specific fix suggestions (Express, Fastify, Next.js, Koa, Hono)

### CI/CD

- **Run in CI** -- Kovar tests are Playwright tests: `npx playwright test` in your existing workflow fails the PR on a regression
- **[Reporter](https://kovar.orlalabs.com/ci/reporter)** -- Playwright reporter with security score cards (counts findings from the `security` fixture)
- **[GitHub Action](https://kovar.orlalabs.com/ci/github-action)** and **[Baseline Tracking](https://kovar.orlalabs.com/ci/baseline)** -- not usable in 0.6.0 (the action is not published and the baseline API is not exported)

### AI Recorder (deprecated)

*Deprecated in 0.7.0 (security fixes only), removed in 0.8.*

- **[Record browser sessions](https://kovar.orlalabs.com/recorder/getting-started)** -- capture interactions and generate Page Object Model tests
- **[Self-Healing](https://kovar.orlalabs.com/recorder/self-healing)** -- auto-fix test failures after recording
- **[Codebase Awareness](https://kovar.orlalabs.com/recorder/codebase-awareness)** -- source-verified locators for React apps (requires installing `@babel/*` packages manually in 0.6.0)

### MCP Server (deprecated)

*Deprecated in 0.7.0, removed in 0.8: the MCP server is moving to Orla Labs Caliper.*

Local-first MCP server for recording, asserting, and replaying agent runs. Runs go to `~/.kovar/runs.db` (no cloud, no auth — override with `KOVAR_DB_PATH`). 15 tools: recording (`record_run`, `append_events`), assertions (`assert_tool_called`, `assert_tool_order`, `assert_no_loops`, `assert_cost_under`, `assert_token_budget_per_step`, `assert_latency_under`, `assert_messages_match`, `assert_no_drift`), canonicals (`record_canonical`), replay and diff (`replay_run`, `diff_runs`), and inspection (`get_run`, `list_runs`). See the [MCP docs](https://kovar.orlalabs.com/mcp/introduction/).

The MCP server's dependencies (`@modelcontextprotocol/sdk`, `better-sqlite3`) are optional peers, so installing Kovar for its assertions stays lean. To use the server, install them alongside Kovar (`npm i -D @orlalabs/kovar @modelcontextprotocol/sdk better-sqlite3`) or let `npx` fetch them. Add to your MCP client config (Claude Code: `~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "kovar": {
      "command": "npx",
      "args": ["-y", "-p", "@orlalabs/kovar", "-p", "@modelcontextprotocol/sdk", "-p", "better-sqlite3", "kovar", "mcp"]
    }
  }
}
```

Then in a session, ask the agent to record what it did and assert against it:

```
You: Solve the bug, then call record_run with run_id="fix-1" capturing every tool
     you used (tool_name, args, timestamp).
You: Now call assert_tool_called(run_id="fix-1", tool_name="Read", args={path:
     "src/auth.ts"}).
You: If that passed, save it as a canonical: record_canonical(name="auth-fix",
     run_ids=["fix-1"]).
```

Or embed it in your own test suite via the public API:

```typescript
import { Store, HANDLERS } from "@orlalabs/kovar/mcp";

const store = new Store({ dbPath: ":memory:" });
HANDLERS.record_run(store, {
  agent_id: "demo",
  run_id: "r1",
  events: [
    { tool_name: "Read", args: { path: "src/auth.ts" }, timestamp: Date.now() },
    { tool_name: "Edit", args: { path: "src/auth.ts" }, timestamp: Date.now() },
  ],
});
const result = HANDLERS.assert_tool_called(store, { run_id: "r1", tool_name: "Read" });
// { passed: true, actual_count: 1, ... }
```

## Documentation

Full documentation is available at **[kovar.orlalabs.com](https://kovar.orlalabs.com)**.

## License

Apache 2.0
