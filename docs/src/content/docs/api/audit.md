---
title: Full Audit
description: Run all security checks at once with security.audit()
---

The `security.audit()` method runs all checks at once and returns a structured report. It's available through the [security fixture](/api/fixture).

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("full security audit", async ({ page, security }) => {
  await page.goto("/dashboard");

  const report = await security.audit();

  expect(report.summary.critical).toBe(0);
  expect(report.summary.high).toBe(0);
});
```

## Report Structure

The audit returns a `SecurityReport` object:

```typescript
{
  url: "https://...",
  timestamp: "2026-03-22T...",
  duration: 142,
  findings: SecurityFinding[],
  summary: { total, critical, high, medium, low, info }
}
```

See [SecurityFinding](/reference/types) for the full type definition.

## Checks That Could Not Run

A check that could not verify anything reports a **high** finding instead of passing, so `audit()` and `.assert()` fail:

| Finding ID | Meaning |
|---|---|
| `audit-page-closed` | `audit()` was called on a closed page |
| `headers-check-skipped` | no page loaded yet (`about:blank`) |
| `xss-no-forms` | no `<form>` found to test (check `selector` and that the page has rendered) |
| `xss-check-error` | every payload request failed |
| `csrf-check-unauthenticated` | the request context is not logged in, so CSRF cannot be evaluated |
| `csrf-check-error`, `cors-check-error`, `auth-check-error` | the endpoint could not be reached |

`report.checksRun` lists the check families that actually ran. In the [GitHub Action](/ci/github-action) these findings always block and are never written to a baseline.

## Including XSS Testing

XSS testing is opt-in because it's slower than other checks:

```typescript
const report = await security.audit({
  includeXSS: true,
  xss: { selector: "#search-form", depth: "standard" },
  headers: { skip: ["permissions-policy"] },
  cookies: { maxExpiryDays: 180 },
});
```

## Specifying Checks

By default, the audit runs headers and cookies. CSRF, CORS, auth, and accessibility are opt-in. Use the `checks` option to specify exactly which checks to run. Note that `csrf` and `auth` send real state-changing requests to the page URL (see [CSRF](/checks/csrf)):

```typescript
const report = await security.audit({
  checks: ["headers", "cookies", "csrf", "cors", "auth", "accessibility"],
  csrf: { methods: ["POST", "DELETE"] },
  cors: { dangerousOrigins: ["http://evil.com"] },
  auth: { endpoints: ["/api/admin/users", "/api/admin/settings"] },
  accessibility: { includeWarnings: true },
});
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `checks` | `string[]` | Which checks to run (default: `["headers", "cookies"]`). Valid names: `headers`, `cookies`, `xss`, `csrf`, `cors`, `auth`, `accessibility`. An unknown name throws and lists the valid names. |
| `includeXSS` | `boolean` | Include XSS testing (default: `false`) |
| `headers` | `object` | Options passed to headers check |
| `cookies` | `object` | Options passed to cookies check |
| `xss` | `object` | Options passed to XSS check |
| `csrf` | `object` | Options passed to CSRF check |
| `cors` | `object` | Options passed to CORS check |
| `auth` | `object` | Options passed to auth check |
| `accessibility` | `object` | Options passed to accessibility check |

## Report Attachment

All findings from the audit are automatically attached as JSON to the Playwright test report. The [Kovar reporter](/ci/reporter) aggregates these across your test suite to produce a security score card.

## Related

- [Security Fixture](/api/fixture) -- for individual check categories.
- [Reporter](/ci/reporter) -- aggregate audit results across test runs.
