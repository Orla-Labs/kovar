---
title: Authentication
description: Test that endpoints require authentication with toRequireAuthentication
---

The `toRequireAuthentication()` matcher tests that endpoints require authentication. Pass a Playwright `APIRequestContext` and a URL.

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("admin API requires authentication", async ({ request }) => {
  await expect(request).toRequireAuthentication("/api/admin/users");
});
```

:::caution[Sends real requests]
By default this sends `GET`, `POST`, `PUT` and `DELETE` without credentials. If the endpoint is in fact unprotected, the `POST`/`PUT`/`DELETE` **execute**. Use a test environment, or pass `methods: ["GET"]`.
:::

## What It Checks

The matcher sends requests from its **own isolated request context**, with no cookies, `storageState`, `extraHTTPHeaders`, HTTP credentials or client certificates, even if the `request` you pass in is logged in (for example through a global auth-setup project with `use.storageState`). It keeps the project's `baseURL`, `ignoreHTTPSErrors` and `proxy`. It verifies:

- The endpoint does not return `2xx` (critical). A `3xx` redirect to a login page is reported as info. Any other non-2xx status (401, 403, but also 404 or 500) counts as rejected.
- Error responses don't contain sensitive keywords (password, secret, api_key, token, private_key, credit_card, ssn, social_security).

CWE mappings:
- [CWE-306](https://cwe.mitre.org/data/definitions/306.html) (Missing Authentication)
- [CWE-284](https://cwe.mitre.org/data/definitions/284.html) (Improper Access Control)
- [CWE-209](https://cwe.mitre.org/data/definitions/209.html) (Information Exposure Through Error Message)

## Options

```typescript
await expect(request).toRequireAuthentication("/api/admin/users", {
  endpoints: ["/api/admin/users", "/api/admin/settings"],  // check multiple endpoints
  methods: ["GET", "POST", "PUT", "DELETE"],               // HTTP methods to test (default: GET, POST, PUT, DELETE)
});
```

| Option | Type | Description |
|--------|------|-------------|
| `endpoints` | `string[]` | Multiple endpoints to check |
| `methods` | `string[]` | HTTP methods to test (default: GET, POST, PUT, DELETE) |
| `baseURL` | `string` | Base URL for relative endpoints (default: the project's `use.baseURL`) |

An `expectedStatus` option exists in the TypeScript types but has no effect in 0.6.0.

## Using the Fixture

```typescript
import { test, expect } from "@orlalabs/kovar";

test("auth audit", async ({ page, security }) => {
  await page.goto("/dashboard");

  // Throws on critical/high findings (tests the current page URL):
  await security.auth.assert();

  // Or inspect findings:
  const authFindings = await security.auth.check({
    endpoints: ["/api/admin/users", "/api/admin/settings"],
  });
  expect(authFindings).toHaveLength(0);
});
```

## Testing Multiple Endpoints

A common pattern is to test all protected endpoints together:

```typescript
import { test, expect } from "@orlalabs/kovar";

test("API endpoints are secure", async ({ request }) => {
  // CSRF: verify state-changing endpoints reject tokenless requests
  await expect(request).toBeCSRFProtected("/api/transfer");

  // CORS: verify no origin reflection or wildcard misconfiguration
  await expect(request).toHaveSecureCORS("/api/data");

  // Auth: verify endpoints reject unauthenticated requests
  await expect(request).toRequireAuthentication("/api/admin/users");
});
```

## Related

- [CSRF](/checks/csrf) -- CSRF protections complement authentication.
- [CORS](/checks/cors) -- CORS misconfigurations can bypass authentication.
- [Full Audit](/api/audit) -- include auth checks in a comprehensive audit with `checks: ["auth"]`.
- [Standalone API](/api/standalone) -- use `checkAuth()` outside Playwright.
