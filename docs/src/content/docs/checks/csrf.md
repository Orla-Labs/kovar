---
title: CSRF
description: Test endpoints for CSRF protection with toBeCSRFProtected
---

The `toBeCSRFProtected()` matcher tests that endpoints reject state-changing requests without CSRF tokens. Pass a Playwright `APIRequestContext` **that is logged in** and a URL.

CSRF is an attack on a logged-in victim, so the check is only meaningful when the request carries the user's session cookie. Use the page's context after logging in:

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("transfer is protected against CSRF", async ({ page }) => {
  await page.goto("/login");
  // ...log in through the UI (or load a storageState)...
  await expect(page.context().request).toBeCSRFProtected("/api/transfer");
});
```

If the endpoint answers `401` or redirects to a login page, the matcher fails with `csrf-check-unauthenticated` ("could not evaluate") instead of passing. Endpoints authenticated only by an `Authorization` header are not CSRF-exposed; skip them.

`page.context().request` shares the page's cookies, so an app that resets the session on a bad token will also log that page out. Run CSRF checks last, or in their own test.

:::caution[Sends real requests]
This check sends real `POST`, `PUT`, `DELETE` and `PATCH` requests (form-encoded body `kovar_csrf_probe=1`) plus one plain `GET` to the URL, using the logged-in session. If the endpoint is unprotected, those requests **execute**. Run it against a test environment, never production, and only on endpoints where such a request is harmless.
:::

## What It Checks

The matcher sends each state-changing method (POST, PUT, DELETE, PATCH) the way a cross-site attacker page would: a form-encoded body, an attacker `Origin`, `Sec-Fetch-Site: cross-site`, and no CSRF token. Redirects are not followed. A `2xx`, or a same-origin redirect that is not to a login page (Post/Redirect/Get), counts as accepted. It also verifies that:

- CSRF tokens are present in response headers or meta tags (reported as **medium**, so it does not fail the matcher).
- Cookies use `SameSite=Strict` or `SameSite=Lax` (reported as **medium**).

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

A `tokenCookies` option exists in the TypeScript types but has no effect.

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
