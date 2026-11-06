---
title: Introduction
description: What is Kovar and why use it for security testing in Playwright
---

Kovar is a security testing assertions library and AI-powered test recorder for Playwright. It lets you add security checks to your E2E tests without being a security expert, and record browser sessions that generate production-grade Page Object Model tests.

## What Kovar Does

Kovar extends Playwright's `test` and `expect` with security-specific fixtures and matchers. Replace your Playwright import with Kovar, and your existing tests continue to work unchanged -- you just get security superpowers on top.

```typescript
import { test, expect } from "@orlalabs/kovar"; // was: '@playwright/test'

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

## Features

Kovar's security module checks seven categories:

- **HTTP Headers** -- 12 OWASP-aligned header checks with CSP validation. See [Headers](/checks/headers).
- **Cookie Flags** -- Session cookie security (Secure, HttpOnly, SameSite, prefix validation). See [Cookies](/checks/cookies).
- **Reflected XSS** -- Detects server-side reflected XSS in HTML forms; not DOM/SPA, stored, or filter-bypass XSS. See [XSS](/checks/xss).
- **CSRF Protection** -- Verifies state-changing endpoints reject tokenless requests. See [CSRF](/checks/csrf).
- **CORS Configuration** -- Tests for origin reflection, wildcard misconfigurations. See [CORS](/checks/cors).
- **Authentication Enforcement** -- Verifies protected endpoints reject unauthenticated requests. See [Authentication](/checks/auth).
- **Accessibility** -- deprecated in 0.7.0 and removed in 0.8; use `@axe-core/playwright`. See [Accessibility](/checks/accessibility).

Beyond security checks, Kovar also provides:

- **[Auto-Remediation](/remediation/overview)** -- Framework-specific fix suggestions for every finding.
- **[CI/CD Integration](/ci/github-action)** -- run your Kovar tests with `npx playwright test`, or scan a URL with the GitHub Action (JSON and SARIF output, baseline, PR comment).
- **[Reporter](/ci/reporter)** -- Playwright reporter with security score cards.
- **[AI Recorder](/recorder/getting-started)** -- deprecated in 0.7.0 and removed in 0.8.

## Beyond Playwright: the MCP Server (deprecated)

v0.6.0 added a separate surface that has nothing to do with Playwright: a local Model Context Protocol server for asserting on AI agent runs. It is deprecated in 0.7.0, moving to Orla Labs Caliper, and removed from Kovar in 0.8. Its dependencies are optional peers.

The agent itself is the caller. It records what it just did into a local SQLite file, then calls assertion tools — `assert_tool_called`, `assert_no_drift`, `assert_cost_under`, `assert_no_loops`, and others — to enforce post-conditions on the run. No SaaS, no cloud, harness-agnostic. See [MCP Server](/mcp/introduction/).

## Design Principles

- **Small surface for the core** -- the security matchers only need `@playwright/test` (peer dependency). Installing Kovar adds 4 packages; the MCP and Babel dependencies are optional peers you install only if you use those features.
- **Drop-in replacement** -- swap one import line, everything else works.
- **Layered architecture** -- pure analysis functions, Playwright matchers, and fixtures are separate layers you can use independently.
- **Actionable findings** -- findings include severity, remediation guidance, and where applicable, CWE IDs.
- **No silent passes** -- a check that could not run (unreachable host, no form, not logged in) fails with a high finding instead of passing.

## Next Steps

- [Install Kovar](/getting-started/installation) in your project.
- Follow the [Quick Start](/getting-started/quick-start) guide.
- Explore individual [security checks](/checks/headers).
