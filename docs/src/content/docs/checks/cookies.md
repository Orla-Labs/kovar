---
title: Cookies
description: Check cookie security flags with toHaveSecureCookies
---

The `toHaveSecureCookies()` matcher checks cookie security flags on session cookies. Pass a Playwright `BrowserContext`.

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("session cookies are secure after login", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("user@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(context).toHaveSecureCookies();
});
```

## Checks Performed

| Check | Severity |
|-------|----------|
| Missing `Secure` flag (session cookie) | critical |
| Missing `HttpOnly` flag (session cookie) | critical |
| `SameSite=None` (session cookie) | high |
| `SameSite=None` (non-session cookie) | medium |
| Missing `Secure` flag (non-session cookie) | medium |
| Expiry > 365 days | medium |
| Broad path (`/`) on session cookie | low |
| `__Host-` prefix violation | high |
| `__Secure-` prefix violation | high |

## Session Cookie Detection

Session cookies are detected by these case-insensitive name patterns (regular expressions):

| Pattern | Matches | Does not match |
|---------|---------|----------------|
| `\bsess(ion)?` | `session`, `next-auth.session-token` | `vercel_session_id`, `laravel_session`, `_app_session` (underscore before `sess`) |
| `\bauth`, `\bcsrf`, `\blogin` | `auth_token`, `csrf`, `login_state` | `myauth` |
| `\bjwt\b` | `jwt`, `jwt.v2` | `jwtToken` |
| `(^\|[_-])sid($\|[_-])` | `sid`, `user-sid` | `sidebar` |
| `[_-]token$` | `access_token`, `sb-access-token` | `token`, `accessToken` |
| exact | `PHPSESSID`, `JSESSIONID`, `ASPSESSIONID*`, `connect.sid` | |

If your session cookie is not matched, it is checked with the weaker non-session rules (missing `Secure` is only **medium**, missing `HttpOnly` is not reported). Add your cookie name with `sessionCookiePatterns`.

```typescript
await expect(context).toHaveSecureCookies({ sessionCookiePatterns: [/^vercel_session_id$/, /_session$/] });
```

## Options

```typescript
await expect(context).toHaveSecureCookies({
  skip: ["analytics"],                    // skip specific cookies by name
  sessionCookiePatterns: [/my_custom/],   // additional session cookie patterns
  maxExpiryDays: 180,                     // custom max expiry (default: 365)
  allowSameSiteNone: ["third_party"],     // allow SameSite=None for specific cookies
});
```

| Option | Type | Description |
|--------|------|-------------|
| `skip` | `string[]` | Cookie names to skip |
| `sessionCookiePatterns` | `RegExp[]` | Additional patterns to identify session cookies |
| `maxExpiryDays` | `number` | Maximum allowed expiry in days (default: 365) |
| `allowSameSiteNone` | `string[]` | Cookies allowed to use `SameSite=None` |

## Using the Fixture

For programmatic control, use the [security fixture](/api/fixture):

```typescript
test("check cookies programmatically", async ({ page, security }) => {
  await page.goto("/login");
  // ... login flow ...

  // Throws on critical/high findings:
  await security.cookies.assert();

  // Or inspect findings manually:
  const findings = await security.cookies.check();
  console.log(`Found ${findings.length} cookie issues`);
});
```

## Related

- [Standalone API](/api/standalone) -- use `analyzeCookies()` outside Playwright.
- [Full Audit](/api/audit) -- run all checks including cookies at once.
- [Headers](/checks/headers) -- HTTP security headers are often configured alongside cookie policies.
