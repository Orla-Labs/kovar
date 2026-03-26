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

## What It Checks

The matcher sends requests without credentials and verifies:

- The endpoint returns 401 or 403 instead of 2xx.
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
  expectedStatus: 401,                                      // expected rejection status
});
```

| Option | Type | Description |
|--------|------|-------------|
| `endpoints` | `string[]` | Multiple endpoints to check |
| `methods` | `string[]` | HTTP methods to test (default: GET, POST, PUT, DELETE) |
| `expectedStatus` | `number` | Expected rejection status code |

## Using the Fixture

```typescript
import { test, expect } from "@orlalabs/kovar";

test("auth audit", async ({ page, security }) => {
  await page.goto("/dashboard");

  // Throws on critical/high findings:
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
