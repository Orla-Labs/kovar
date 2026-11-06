---
title: CORS
description: Test CORS configuration for misconfigurations with toHaveSecureCORS
---

The `toHaveSecureCORS()` matcher tests CORS configuration for misconfigurations. Pass a Playwright `APIRequestContext` and a URL.

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("API has secure CORS", async ({ request }) => {
  await expect(request).toHaveSecureCORS("/api/data");
});
```

## What It Checks

The matcher sends preflight requests with untrusted origins and checks for:

| Check | Severity |
|-------|----------|
| Reflects untrusted origin with credentials | critical |
| Wildcard origin (`*`) with credentials | critical |
| Wildcard origin (`*`) | high |
| Reflects untrusted origin without credentials | high |
| Wildcard `Access-Control-Allow-Headers` | high |
| Allows dangerous methods (PUT, DELETE, PATCH) | medium |

CWE mappings:
- [CWE-942](https://cwe.mitre.org/data/definitions/942.html) (Permissive CORS Policy)
- [CWE-346](https://cwe.mitre.org/data/definitions/346.html) (Origin Validation Error)

## Options

```typescript
await expect(request).toHaveSecureCORS("/api/data", {
  dangerousOrigins: ["null", "http://evil.com"],      // origins to test against (default: ["null", "http://evil.com"])
});
```

| Option | Type | Description |
|--------|------|-------------|
| `dangerousOrigins` | `string[]` | Origins to test against (default: `["null", "http://evil.com"]`) |
| `url` | `string` | URL to test; overrides the URL argument (with the fixture, defaults to the current page URL) |

A `trustedOrigins` option exists in the TypeScript types but has no effect in 0.6.0: the check only tests `dangerousOrigins`.

## Using the Fixture

```typescript
import { test, expect } from "@orlalabs/kovar";

test("CORS audit", async ({ page, security }) => {
  await page.goto("/dashboard");

  // Inspect findings:
  const corsFindings = await security.cors.check();
  const critical = corsFindings.filter((f) => f.severity === "critical");
  expect(critical).toHaveLength(0);
});
```

## Related

- [CSRF](/checks/csrf) -- CORS and CSRF protections work together.
- [Authentication](/checks/auth) -- authentication bypasses can be amplified by CORS misconfigurations.
- [Full Audit](/api/audit) -- include CORS in a comprehensive audit with `checks: ["cors"]`.
- [Standalone API](/api/standalone) -- use `checkCORS()` outside Playwright.
