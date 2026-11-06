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

:::caution[Sends real requests]
This check sends real `POST`, `PUT`, `DELETE` and `PATCH` requests (JSON body `{}`) to the URL. If the endpoint is unprotected, those requests **execute**. Run it against a test environment, never production, and only on endpoints where an empty request is harmless.
:::

## What It Checks

The matcher sends state-changing HTTP methods (POST, PUT, DELETE, PATCH) without a CSRF token and checks whether the endpoint accepts them. It also verifies that:

- CSRF tokens are present in response headers or meta tags (reported as **medium**, so it does not fail the matcher).
- Cookies use `SameSite=Strict` or `SameSite=Lax` (reported as **medium**).

Only a `2xx` response to a tokenless state-changing request is critical. The request is sent by Playwright's `request` context, which has no browser session, so an endpoint that requires login will usually reject it for that reason alone (a pass), and an endpoint that is public will be reported as a CSRF failure.

CWE mapping: [CWE-352](https://cwe.mitre.org/data/definitions/352.html) (Cross-Site Request Forgery)

## Options

```typescript
await expect(request).toBeCSRFProtected("/api/transfer", {
  endpoints: ["/api/transfer", "/api/settings"],   // check multiple endpoints
  methods: ["POST", "DELETE"],                      // specific methods (default: POST, PUT, DELETE, PATCH)
  tokenHeaders: ["x-csrf-token", "x-xsrf-token"],  // custom token header names
  skip: ["/api/health"],                            // skip URL patterns
});
```

| Option | Type | Description |
|--------|------|-------------|
| `endpoints` | `string[]` | Multiple endpoints to check |
| `methods` | `string[]` | HTTP methods to test (default: POST, PUT, DELETE, PATCH) |
| `tokenHeaders` | `string[]` | Custom CSRF token header names |
| `skip` | `string[]` | Endpoints to skip (substring match) |

A `tokenCookies` option exists in the TypeScript types but has no effect in 0.6.0.

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
