---
title: Quick Start
description: Get up and running with Kovar security testing in minutes
---

## Your First Security Test

Replace your Playwright import with Kovar and add a security assertion:

```typescript
import { test, expect } from "@orlalabs/kovar"; // was: '@playwright/test'

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

That single line checks 12 security headers against OWASP recommendations. This assumes `baseURL` is set in `playwright.config.ts` (see [Installation](/getting-started/installation)).

## Expect Your First Run To Be Red

Most apps fail this test the first time. That is the point, but it helps to know what you are looking at:

- The matcher fails only on **critical** and **high** findings. Medium/low findings are printed for information.
- Each finding prints a `Fix:` line with the header value to set. For framework-specific code (Express, Fastify, Next.js, Koa, Hono), see [Auto-Remediation](/remediation/overview).
- **Running against `http://localhost`?** HSTS is reported as critical, but browsers ignore HSTS over plain http. Either run the check against your HTTPS staging URL, or skip it locally:

```typescript
await expect(response!).toHaveSecureHeaders({
  skip: process.env.CI ? [] : ["strict-transport-security"],
});
```

- `skip` and `only` take full, lowercase header names (`"content-security-policy"`, not `"CSP"`).
- To adopt Kovar on an app with known gaps, start with `only: [...]` for the headers you already set, so the test guards against regressions today, then widen it as you fix the rest.

## Add Security to Existing Tests

You don't need separate security test files. Add security checks to your existing functional tests:

```typescript
import { test, expect } from "@orlalabs/kovar";

test("user can log in", async ({ page, context }) => {
  // Your existing test logic
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("test@example.com");
  await page.getByLabel("Password").fill("Test1234!");
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/dashboard")),
    page.getByRole("button", { name: "Sign In" }).click(),
  ]);
  await expect(page).toHaveURL("/dashboard");

  // Add security checks -- one line each
  await expect(response).toHaveSecureHeaders();
  await expect(context).toHaveSecureCookies();
});
```

:::caution
Prefer the matchers on the real navigation `response` for pages behind login. The `security.headers` fixture re-requests `page.url()` with Playwright's separate `request` context, which does **not** share the browser's login cookies, so on an authenticated page it can end up checking the login page you were redirected to instead.
:::

## Dedicated Security Test File

For comprehensive coverage, create a dedicated security spec that checks multiple pages:

```typescript
// tests/security.spec.ts
import { test, expect } from "@orlalabs/kovar";

const PAGES = ["/", "/login", "/dashboard", "/settings", "/api/health"];

for (const path of PAGES) {
  test(`${path} has secure headers`, async ({ page }) => {
    const response = await page.goto(path);
    await expect(response!).toHaveSecureHeaders();
  });
}

test("session cookies are secure", async ({ page, context }) => {
  await page.goto("/login");
  // ... login flow ...
  await expect(context).toHaveSecureCookies();
});

test("search is resilient to XSS", async ({ page }) => {
  await page.goto("/search");
  await expect(page).toBeResilientToXSS({ depth: "standard" });
});
```

## Check API Endpoints

Security matchers work with API responses too:

```typescript
test("API endpoint has secure headers", async ({ request }) => {
  const response = await request.get("/api/users");
  await expect(response).toHaveSecureHeaders({
    skip: ["x-frame-options"], // API endpoints don't need framing protection
  });
});
```

## Run a Full Audit

The `security.audit()` method runs headers and cookies by default (XSS, CSRF, CORS, auth and accessibility are opt-in):

```typescript
test("full security audit", async ({ page, security }) => {
  await page.goto("/dashboard");

  const report = await security.audit();

  expect(report.summary.critical).toBe(0);
  expect(report.summary.high).toBe(0);
});
```

See [Full Audit](/api/audit) for options and report structure.

## Custom Severity Threshold

Instead of pass/fail matchers, inspect findings programmatically:

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

## Next Steps

- Explore individual checks: [Headers](/checks/headers), [Cookies](/checks/cookies), [XSS](/checks/xss), [CSRF](/checks/csrf), [CORS](/checks/cors), [Authentication](/checks/auth), [Accessibility](/checks/accessibility).
- Learn about the [Security Fixture](/api/fixture) for programmatic control.
- Set up the [Reporter](/ci/reporter) for security score cards.
- Try the [AI Recorder](/recorder/getting-started) to generate tests from browser sessions.
