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

That single line checks 12 security headers against OWASP recommendations.

## Add Security to Existing Tests

You don't need separate security test files. Add security checks to your existing functional tests:

```typescript
import { test, expect } from "@orlalabs/kovar";

test("user can log in", async ({ page, context, security }) => {
  // Your existing test logic
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("test@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("Test1234!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL("/dashboard");

  // Add security checks -- one line each
  await security.headers.assert();
  await security.cookies.assert();
});
```

The `security` fixture is injected automatically when you import from `@orlalabs/kovar`.

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

The `security.audit()` method runs all checks at once:

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
