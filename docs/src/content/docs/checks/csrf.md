---
title: CSRF
description: Test endpoints for CSRF protection with toBeCSRFProtected
---

The `toBeCSRFProtected()` matcher tests that endpoints reject state-changing requests without CSRF tokens. Pass a Playwright `APIRequestContext` and a URL.

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("API is protected against CSRF", async ({ request }) => {
  await expect(request).toBeCSRFProtected("/api/transfer");
});
```

## What It Checks

The matcher sends state-changing HTTP methods (POST, PUT, DELETE, PATCH) without a CSRF token and checks whether the endpoint accepts them. It also verifies that:

- CSRF tokens are present in response headers or meta tags.
- Cookies use `SameSite=Strict` or `SameSite=Lax`.

CWE mapping: [CWE-352](https://cwe.mitre.org/data/definitions/352.html) (Cross-Site Request Forgery)

## Options

```typescript
await expect(request).toBeCSRFProtected("/api/transfer", {
  endpoints: ["/api/transfer", "/api/settings"],   // check multiple endpoints
  methods: ["POST", "DELETE"],                      // specific methods (default: POST, PUT, DELETE, PATCH)
  tokenHeaders: ["x-csrf-token", "x-xsrf-token"],  // custom token header names
  tokenCookies: ["csrf_token"],                     // token cookie names
  skip: ["/api/health"],                            // skip URL patterns
});
```

| Option | Type | Description |
|--------|------|-------------|
| `endpoints` | `string[]` | Multiple endpoints to check |
| `methods` | `string[]` | HTTP methods to test (default: POST, PUT, DELETE, PATCH) |
| `tokenHeaders` | `string[]` | Custom CSRF token header names |
| `tokenCookies` | `string[]` | Cookie names that carry CSRF tokens |
| `skip` | `string[]` | URL patterns to skip |

## Using the Fixture

```typescript
import { test, expect } from "@orlalabs/kovar";

test("API security audit", async ({ page, security }) => {
  await page.goto("/dashboard");

  // Throws on critical/high findings:
  await security.csrf.assert();

  // Or inspect findings:
  const findings = await security.csrf.check({ methods: ["POST", "DELETE"] });
  const critical = findings.filter((f) => f.severity === "critical");
  expect(critical).toHaveLength(0);
});
```

## Related

- [CORS](/checks/cors) -- CORS misconfigurations can weaken CSRF protections.
- [Authentication](/checks/auth) -- authentication and CSRF protections complement each other.
- [Full Audit](/api/audit) -- include CSRF in a comprehensive audit with `checks: ["csrf"]`.
- [Standalone API](/api/standalone) -- use `checkCSRF()` outside Playwright.
