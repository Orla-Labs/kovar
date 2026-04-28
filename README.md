# Kovar

Security testing assertions + AI-powered test recording for Playwright. Add security checks to your E2E tests without being a security expert, and record browser sessions that generate production-grade Page Object Model tests.

## Install

```bash
npm install -D @orlalabs/kovar
```

## Quick Start

Replace your Playwright import with Kovar -- everything else stays the same:

```typescript
import { test, expect } from "@orlalabs/kovar"; // was: '@playwright/test'

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

## Features

### Security Checks

- **[HTTP Headers](https://kovar.orlalabs.com/checks/headers)** -- 12 OWASP-aligned header checks with CSP validation
- **[Cookie Flags](https://kovar.orlalabs.com/checks/cookies)** -- session cookie security (Secure, HttpOnly, SameSite, prefix validation)
- **[Reflected XSS](https://kovar.orlalabs.com/checks/xss)** -- 40 polyglot payloads with API-first and DOM testing
- **[CSRF Protection](https://kovar.orlalabs.com/checks/csrf)** -- verifies state-changing endpoints reject tokenless requests
- **[CORS Configuration](https://kovar.orlalabs.com/checks/cors)** -- tests for origin reflection and wildcard misconfigurations
- **[Authentication](https://kovar.orlalabs.com/checks/auth)** -- verifies protected endpoints reject unauthenticated requests
- **[Accessibility](https://kovar.orlalabs.com/checks/accessibility)** -- 10 WCAG 2.1 rules covering images, forms, landmarks, headings

### Fixtures & API

- **[Security Fixture](https://kovar.orlalabs.com/api/fixture)** -- programmatic access to all checks with `assert()` and `check()` modes
- **[Full Audit](https://kovar.orlalabs.com/api/audit)** -- run all checks at once and get a structured report
- **[Standalone API](https://kovar.orlalabs.com/api/standalone)** -- use check functions outside the Playwright test runner

### Remediation & Compliance

- **[Auto-Remediation](https://kovar.orlalabs.com/remediation/overview)** -- framework-specific fix suggestions (Express, Fastify, Next.js, Koa, Hono)
- **[OWASP ASVS](https://kovar.orlalabs.com/compliance/owasp-asvs)** -- map findings to ASVS 4.0.3 requirements
- **[PCI-DSS](https://kovar.orlalabs.com/compliance/pci-dss)** -- map findings to PCI-DSS 4.0 requirements

### CI/CD

- **[GitHub Action](https://kovar.orlalabs.com/ci/github-action)** -- run security checks in CI with PR comments
- **[Baseline Tracking](https://kovar.orlalabs.com/ci/baseline)** -- detect regressions across PRs
- **[Reporter](https://kovar.orlalabs.com/ci/reporter)** -- Playwright reporter with security score cards

### AI Recorder

- **[Record browser sessions](https://kovar.orlalabs.com/recorder/getting-started)** -- capture interactions and generate Page Object Model tests
- **[Self-Healing](https://kovar.orlalabs.com/recorder/self-healing)** -- auto-fix test failures after recording
- **[Codebase Awareness](https://kovar.orlalabs.com/recorder/codebase-awareness)** -- source-verified locators for higher test stability

### MCP Server

Local-first MCP server for recording, asserting, and replaying agent runs. Runs go to `~/.kovar/runs.db` (no cloud, no auth — override with `KOVAR_DB_PATH`). Tools exposed: `record_run`, `assert_tool_called`, `assert_no_drift`, `assert_cost_under`, `replay_run`, `record_canonical`, `get_run`, `list_runs`.

Add to your MCP client config (Claude Code: `~/.claude.json` or project `.mcp.json`):

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
