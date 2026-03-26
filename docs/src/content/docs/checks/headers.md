---
title: Headers
description: Check HTTP security headers against OWASP recommendations with toHaveSecureHeaders
---

The `toHaveSecureHeaders()` matcher checks 12 security headers against OWASP recommendations. Pass a Playwright `Response` object.

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("API has secure headers", async ({ page }) => {
  const response = await page.goto("/dashboard");
  await expect(response!).toHaveSecureHeaders();
});
```

## Headers Checked

| Header | Severity if Missing |
|--------|---------------------|
| `Strict-Transport-Security` | critical |
| `Content-Security-Policy` | critical |
| `X-Content-Type-Options` | high |
| `X-Frame-Options` | high |
| `Referrer-Policy` | medium |
| `Permissions-Policy` | medium |
| `Cross-Origin-Opener-Policy` | low |
| `Cross-Origin-Resource-Policy` | low |
| `Cross-Origin-Embedder-Policy` | low |
| `X-XSS-Protection` (non-zero) | info |
| `X-Powered-By` (present) | low |
| `Server` (version exposed) | info |

## CSP Validation

Content-Security-Policy validation goes beyond checking for the header's presence. It flags:

- Wildcard sources (`default-src *`, `script-src *`)
- Dangerous directives (`'unsafe-eval'`, `'unsafe-hashes'`)
- `'unsafe-inline'` without a `'nonce-'` fallback

## Options

```typescript
await expect(response).toHaveSecureHeaders({
  skip: ["permissions-policy"],           // skip specific headers
  only: ["strict-transport-security"],    // check only these
  requiredCSPDirectives: ["script-src"],  // require specific CSP directives
  minHSTSMaxAge: 604800,                  // custom HSTS max-age threshold (default: 31536000)
});
```

| Option | Type | Description |
|--------|------|-------------|
| `skip` | `string[]` | Header names to skip |
| `only` | `string[]` | Check only these headers |
| `requiredCSPDirectives` | `string[]` | CSP directives that must be present |
| `minHSTSMaxAge` | `number` | Minimum HSTS max-age in seconds (default: 31536000) |
| `allowXFrameOptionsSameOrigin` | `boolean` | Allow `SAMEORIGIN` for X-Frame-Options (default: `false`) |

## API Endpoint Example

Security matchers also work with API responses via the `request` fixture:

```typescript
test("API endpoint has secure headers", async ({ request }) => {
  const response = await request.get("/api/users");
  await expect(response).toHaveSecureHeaders({
    skip: ["x-frame-options"], // API endpoints don't need framing protection
  });
});
```

## Using the Fixture

For programmatic control, use the [security fixture](/api/fixture):

```typescript
test("check headers programmatically", async ({ page, security }) => {
  await page.goto("/dashboard");

  // Throws on critical/high findings:
  await security.headers.assert();

  // Or inspect findings manually:
  const findings = await security.headers.check();
  const critical = findings.filter((f) => f.severity === "critical");
  expect(critical).toHaveLength(0);
});
```

## Related

- [Standalone API](/api/standalone) -- use `analyzeHeaders()` outside Playwright.
- [Full Audit](/api/audit) -- run all checks including headers at once.
- [Auto-Remediation](/remediation/overview) -- generate framework-specific fixes for header findings.
