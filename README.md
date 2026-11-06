# Kovar

Security regression tests that live inside your Playwright suite.

Swap one import, add one `expect`, and a header, cookie, CORS or auth regression fails your PR. No security team, no DAST, no new runner.

## What a failure looks like

```
Error: expect(received).toHaveSecureHeaders(expected)

  [CRITICAL] content-security-policy: Content-Security-Policy header is missing
           Fix: Set a Content-Security-Policy header. Start with: default-src 'self'; script-src 'self'

  [HIGH] x-content-type-options: X-Content-Type-Options header is missing
           Fix: Set X-Content-Type-Options: nosniff

  [MEDIUM] referrer-policy: Referrer-Policy header is missing
           Fix: Set Referrer-Policy: strict-origin-when-cross-origin
  ...
```

Critical and high findings fail the test; medium and below are reported. Every finding names the header or cookie and the fix.

## Quickstart (60 seconds)

```bash
npm install -D @orlalabs/kovar @playwright/test
npx playwright install chromium
```

Kovar's examples use relative URLs, so give Playwright a `baseURL` (and usually a `webServer` that starts your app):

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
```

Replace your Playwright import with Kovar; everything else stays the same:

```typescript
import { test, expect } from "@orlalabs/kovar"; // was: "@playwright/test"

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

```bash
npx playwright test
```

**Expect the first run to be red.** On plain `http://localhost`, add `{ skip: ["strict-transport-security"] }` (HSTS only applies over HTTPS). To adopt Kovar on an app with known gaps, start with `{ only: [...] }` for the headers you already set, then fix the rest in severity order. See the [Quick Start](https://kovar.orlalabs.com/getting-started/quick-start).

## Add it to CI

Kovar tests are Playwright tests. `npx playwright test` in your existing workflow fails the PR on a regression; add the [Reporter](https://kovar.orlalabs.com/ci/reporter) for a score card in the log.

For a URL-only header and cookie scan with SARIF output, a baseline and a PR comment, use the [GitHub Action](https://kovar.orlalabs.com/ci/github-action) (`Orla-Labs/kovar/.github/actions/security-check@v0.7.0`) with [Baseline Tracking](https://kovar.orlalabs.com/ci/baseline).

## Checks

| Check | Matcher | Fails the test on | What it sends |
|---|---|---|---|
| [Headers](https://kovar.orlalabs.com/checks/headers) | `expect(response).toHaveSecureHeaders()` | Missing or weak CSP, HSTS, XFO / `frame-ancestors`, `nosniff` (12 headers) | Nothing; reads the response |
| [Cookies](https://kovar.orlalabs.com/checks/cookies) | `expect(context).toHaveSecureCookies()` | Session cookies without `Secure` / `HttpOnly` / `SameSite`, bad `__Host-` / `__Secure-` prefixes | Nothing; reads the browser's cookies |
| [Reflected XSS](https://kovar.orlalabs.com/checks/xss) | `expect(page).toBeResilientToXSS()` | Detects server-side reflected XSS in HTML forms; not DOM/SPA, stored, or filter-bypass XSS. | Submits payloads to each form's action |
| [CSRF](https://kovar.orlalabs.com/checks/csrf) | `expect(request).toBeCSRFProtected(url)` | A state-changing endpoint that accepts a cross-site, tokenless request. Needs a **logged-in** context | **Real `POST`/`PUT`/`DELETE`/`PATCH`** plus a control `GET` |
| [CORS](https://kovar.orlalabs.com/checks/cors) | `expect(request).toHaveSecureCORS(url)` | Reflected or bypassable origins with credentials, wildcard misconfiguration | `OPTIONS` and `GET` with attacker `Origin`s |
| [Auth](https://kovar.orlalabs.com/checks/auth) | `expect(request).toRequireAuthentication(url)` | An endpoint that returns `2xx` without credentials | **Real `GET`/`POST`/`PUT`/`DELETE`** from an isolated, credential-free context |

A check that **could not run** (unreachable host, no form found, not logged in, page closed) fails with a high finding such as `csrf-check-unauthenticated` or `xss-no-forms`; it never passes silently. Every check is also available through the [`security` fixture](https://kovar.orlalabs.com/api/fixture), [`security.audit()`](https://kovar.orlalabs.com/api/audit) and the [standalone API](https://kovar.orlalabs.com/api/standalone).

## Fixing findings

[Remediation](https://kovar.orlalabs.com/remediation/overview) generates framework-specific fixes for Express, Fastify, Next.js, Koa and Hono (`generateRemediation`, `detectFramework` from `@orlalabs/kovar/core`).

## Limitations

Kovar is a regression test, not a scanner. Read [What Kovar does not catch](https://kovar.orlalabs.com/reference/limitations) before you rely on it.

## Also in this package (deprecated, removed in 0.8)

- **[AI recorder](https://kovar.orlalabs.com/recorder/getting-started)** (`kovar record`): security fixes only. Use Playwright's codegen and test agents.
- **[MCP run assertions](https://kovar.orlalabs.com/mcp/introduction/)** (`kovar mcp`, `@orlalabs/kovar/mcp`): moving to Orla Labs Caliper. Needs the optional peers `@modelcontextprotocol/sdk` and `better-sqlite3`.
- **[Accessibility](https://kovar.orlalabs.com/checks/accessibility)** (`toBeAccessible`): use [`@axe-core/playwright`](https://playwright.dev/docs/accessibility-testing).

## Documentation

Full documentation is available at **[kovar.orlalabs.com](https://kovar.orlalabs.com)**.

## License

Apache 2.0
