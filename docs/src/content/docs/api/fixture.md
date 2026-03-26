---
title: Security Fixture
description: Programmatic access to security checks with assert and check modes
---

The `security` fixture gives programmatic access to all security checks. It's injected automatically when you import from `@orlalabs/kovar`.

## Two Modes

Each check category supports two modes:

- **`.assert()`** -- throws if any critical or high severity findings exist. Use this for pass/fail tests.
- **`.check()`** -- returns all findings without throwing, so you can inspect and filter them.

## Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("verify security after login", async ({ page, security }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("user@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/dashboard");

  // Throws on critical/high findings:
  await security.headers.assert();
  await security.cookies.assert();
  await security.csrf.assert();
  await security.auth.assert();

  // Or inspect findings manually:
  const corsFindings = await security.cors.check();
  const critical = corsFindings.filter((f) => f.severity === "critical");
  expect(critical).toHaveLength(0);

  // Accessibility checks:
  await security.accessibility.check({ includeWarnings: true });
});
```

## Available Categories

| Category | Assert | Check | Options |
|----------|--------|-------|---------|
| `security.headers` | `assert(options?)` | `check(options?)` | See [Headers](/checks/headers) |
| `security.cookies` | `assert(options?)` | `check(options?)` | See [Cookies](/checks/cookies) |
| `security.csrf` | `assert(options?)` | `check(options?)` | See [CSRF](/checks/csrf) |
| `security.cors` | `assert(options?)` | `check(options?)` | See [CORS](/checks/cors) |
| `security.auth` | `assert(options?)` | `check(options?)` | See [Authentication](/checks/auth) |
| `security.xss` | `assert(options?)` | `check(options?)` | See [XSS](/checks/xss) |
| `security.accessibility` | `assert(options?)` | `check(options?)` | See [Accessibility](/checks/accessibility) |

## Automatic Report Attachment

All findings from the `security` fixture are automatically attached as JSON to the Playwright test report. This means the [Kovar reporter](/ci/reporter) can aggregate them across your test suite without any additional configuration.

## Custom Severity Threshold

Use `.check()` to implement custom severity thresholds:

```typescript
test("no medium-or-above findings", async ({ page, security }) => {
  await page.goto("/dashboard");
  const findings = await security.headers.check();
  const serious = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high" || f.severity === "medium",
  );
  expect(serious).toHaveLength(0);
});
```

## Related

- [Full Audit](/api/audit) -- run all checks at once with `security.audit()`.
- [Standalone API](/api/standalone) -- use checks outside the Playwright test runner.
- [Reporter](/ci/reporter) -- aggregate security findings across your test suite.
