# Kovar

Security testing assertions + AI-powered test recording for Playwright. Add security checks to your E2E tests without being a security expert, and record browser sessions that generate production-grade Page Object Model tests.

```
npm install -D kovar
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Security Module](#security-module)
  - [Setup](#setup)
  - [Matchers](#matchers)
    - [toHaveSecureHeaders](#tohavesecureheadersoptions)
    - [toHaveSecureCookies](#tohavesecurecookiesoptions)
    - [toBeResilientToXSS](#toberesilienttoxssoptions)
  - [Security Fixture](#security-fixture)
  - [Full Audit](#full-audit)
  - [Standalone API](#standalone-api)
  - [Reporter](#reporter)
  - [Practical Examples](#practical-examples)
- [Recorder](#recorder)
  - [Getting Started](#getting-started)
  - [What Gets Generated](#what-gets-generated)
  - [CLI Reference](#cli-reference)
  - [Codebase Awareness (Beta)](#codebase-awareness-beta)
  - [How the Recorder Works](#how-the-recorder-works)
  - [Recorder Tips](#recorder-tips)
- [Limitations](#limitations)
- [License](#license)

---

## Quick Start

Replace your Playwright import with Kovar -- everything else stays the same:

```typescript
import { test, expect } from "kovar"; // was: '@playwright/test'

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

Kovar extends Playwright's `test` and `expect` with security-specific fixtures and matchers. All your existing tests continue to work unchanged.

---

## Security Module

Kovar's security module checks three categories: **HTTP headers**, **cookie flags**, and **reflected XSS**. Each category works as a Playwright matcher, a programmatic fixture method, or a standalone function.

### Setup

```typescript
// Replace this:
import { test, expect } from "@playwright/test";

// With this:
import { test, expect } from "kovar";
```

That's it. Your existing tests still work, and you now have access to security matchers and the `security` fixture.

### Matchers

#### `toHaveSecureHeaders(options?)`

Checks 12 security headers against OWASP recommendations. Pass a Playwright `Response` object:

```typescript
test("API has secure headers", async ({ page }) => {
  const response = await page.goto("/dashboard");
  await expect(response!).toHaveSecureHeaders();
});
```

Headers checked:

| Header | Severity if Missing |
|--------|-------------------|
| `Strict-Transport-Security` | critical |
| `Content-Security-Policy` | critical |
| `X-Content-Type-Options` | high |
| `X-Frame-Options` | high |
| `Referrer-Policy` | medium |
| `Permissions-Policy` | medium |
| `Cross-Origin-Opener-Policy` | medium |
| `Cross-Origin-Resource-Policy` | medium |
| `Cross-Origin-Embedder-Policy` | low |
| `X-XSS-Protection` (non-zero) | info |
| `X-Powered-By` (present) | low |
| `Server` (version exposed) | info |

CSP validation goes beyond presence -- it flags:
- Wildcard sources (`default-src *`, `script-src *`)
- Dangerous directives (`'unsafe-eval'`, `'unsafe-hashes'`)
- `'unsafe-inline'` without a `'nonce-'` fallback

Options:

```typescript
await expect(response).toHaveSecureHeaders({
  skip: ["permissions-policy"],           // skip specific headers
  only: ["strict-transport-security"],    // check only these
  requiredCSPDirectives: ["script-src"],  // require specific CSP directives
  minHSTSMaxAge: 604800,                  // custom HSTS max-age threshold (default: 31536000)
});
```

#### `toHaveSecureCookies(options?)`

Checks cookie security flags on session cookies. Pass a Playwright `BrowserContext`:

```typescript
test("session cookies are secure after login", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("user@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(context).toHaveSecureCookies();
});
```

Checks performed:

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

Session cookies are detected by name patterns: `sess`, `token`, `auth`, `csrf`, `jwt`, `sid`, `login`, `PHPSESSID`, `JSESSIONID`, `ASPSESSIONID`, `connect.sid`.

Options:

```typescript
await expect(context).toHaveSecureCookies({
  skip: ["analytics"],                    // skip specific cookies by name
  sessionCookiePatterns: [/my_custom/],   // additional session cookie patterns
  maxExpiryDays: 180,                     // custom max expiry (default: 365)
  allowSameSiteNone: ["third_party"],     // allow SameSite=None for specific cookies
});
```

#### `toBeResilientToXSS(options?)`

Tests form inputs against XSS payloads. By default uses **API-first injection** -- submits payloads via HTTP and analyzes response bodies for unescaped reflection, without causing DOM side effects. Falls back to DOM testing with `alert()` dialog detection when needed.

```typescript
test("search form resists XSS", async ({ page }) => {
  await page.goto("/search");
  await expect(page).toBeResilientToXSS({
    selector: "#search-form",
    depth: "quick",
  });
});
```

40 polyglot payloads across 3 depth levels:

| Depth | Payloads | What it tests |
|-------|----------|---------------|
| `quick` | 10 | Common HTML injection: `<img onerror>`, `<svg onload>`, `<script>`, attribute breakouts, `javascript:` protocol, template literals |
| `standard` | 25 (cumulative) | + encoding evasion, mixed case, null bytes, newlines in handlers, comment breakouts, quote-style variations |
| `thorough` | 40 (cumulative) | + unicode escapes, HTML entity encoding, data URIs, base64, context breakouts (textarea, title, style, noscript), polyglot all-context |

Options:

```typescript
await expect(page).toBeResilientToXSS({
  selector: "#login-form",       // target a specific form (optional, auto-discovers all forms)
  depth: "standard",             // "quick" | "standard" | "thorough" (default: "quick")
  timeout: 5000,                 // per-payload timeout in ms
  skipPayloads: ["poly-009"],    // skip specific payload IDs
  apiFirst: false,               // set false to use DOM testing instead of API-first
});
```

### Security Fixture

The `security` fixture gives programmatic access to checks with two modes:

- **`.assert()`** -- throws if any critical or high severity findings exist
- **`.check()`** -- returns all findings without throwing, so you can inspect them

```typescript
import { test, expect } from "kovar";

test("verify security after login", async ({ page, security }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("user@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/dashboard");

  // Throws on critical/high findings:
  await security.headers.assert();
  await security.cookies.assert();

  // Or inspect findings manually:
  const cookieFindings = await security.cookies.check();
  const mediumCookies = cookieFindings.filter((f) => f.severity === "medium");
  expect(mediumCookies).toHaveLength(0);
});
```

### Full Audit

Run all checks at once and get a structured report:

```typescript
test("full security audit", async ({ page, security }) => {
  await page.goto("/dashboard");

  const report = await security.audit();

  // Report structure:
  // {
  //   url: "https://...",
  //   timestamp: "2026-03-22T...",
  //   duration: 142,
  //   findings: SecurityFinding[],
  //   summary: { total, critical, high, medium, low, info }
  // }

  expect(report.summary.critical).toBe(0);
  expect(report.summary.high).toBe(0);
});
```

Include XSS testing in the audit (opt-in because it's slower):

```typescript
const report = await security.audit({
  includeXSS: true,
  xss: { selector: "#search-form", depth: "standard" },
  headers: { skip: ["permissions-policy"] },
  cookies: { maxExpiryDays: 180 },
});
```

Or specify exactly which checks to run:

```typescript
const report = await security.audit({
  checks: ["headers", "cookies"],   // only these, skip xss even if includeXSS is set
});
```

All findings from the `security` fixture are automatically attached as JSON to the Playwright test report, so the Kovar reporter can aggregate them across your test suite.

### Standalone API

Use Kovar's check functions outside the Playwright test runner -- in scripts, CI pipelines, or custom tooling:

```typescript
import { chromium } from "playwright";
import { analyzeHeaders, analyzeCookies, mapPlaywrightCookies, XSSScanner } from "kovar/core";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const response = await page.goto("https://your-app.com");

// Check headers
const headerFindings = analyzeHeaders(response!.headers());
for (const f of headerFindings) {
  console.log(`[${f.severity}] ${f.message}`);
  console.log(`  Fix: ${f.remediation}`);
}

// Check cookies
const cookies = await context.cookies();
const cookieFindings = analyzeCookies(mapPlaywrightCookies(cookies));

// Run XSS scan
const scanner = new XSSScanner(page, context.request);
const xssResult = await scanner.scan({ depth: "quick" });

await browser.close();
```

Each finding has a consistent shape:

```typescript
interface SecurityFinding {
  id: string;                                        // e.g. "header-missing-hsts", "cookie-missing-secure", "xss-poly-001"
  category: "headers" | "cookies" | "xss";
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;                                   // human-readable description
  remediation: string;                               // how to fix
  header?: string;                                   // for header findings
  cookie?: string;                                   // for cookie findings
  payload?: string;                                  // for XSS findings
  evidence?: string;                                 // for XSS findings
}
```

### Reporter

Add the Kovar reporter to your Playwright config for a security summary after each test run:

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["list"], ["kovar/reporter"]],
});
```

The reporter aggregates all findings from tests that use the `security` fixture and prints a score card:

```
┌─ Kovar Security Summary ────────────────────────────┐
│                                                      │
│  Score: 60/100                                       │
│                                                      │
│  ✗ 2 critical                                        │
│  ✗ 1 high                                            │
│  ⚠ 3 medium                                          │
│                                                      │
│  4 test(s) with security findings                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Scoring: -20 per critical, -10 per high, -5 per medium, -2 per low.

### Practical Examples

**Add security checks to an existing login test:**

```typescript
import { test, expect } from "kovar";

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

**Dedicated security test file:**

```typescript
// tests/security.spec.ts
import { test, expect } from "kovar";

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

**Check headers on an API response:**

```typescript
test("API endpoint has secure headers", async ({ request }) => {
  const response = await request.get("/api/users");
  await expect(response).toHaveSecureHeaders({
    skip: ["x-frame-options"],  // API endpoints don't need framing protection
  });
});
```

**Custom severity threshold:**

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

---

## Recorder

The recorder opens a Chromium browser, captures your interactions, and uses AI to generate Page Object Model tests with resilient locators and environment-driven credentials.

### Getting Started

1. Set an API key in your `.env` file:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...
```

2. Record:

```bash
npx kovar record https://your-app.com
```

3. A Chromium browser opens with a recording toolbar at the top. Browse your app -- click buttons, fill forms, navigate pages. The toolbar shows action and API call counts in real time.

4. Click **Stop** when you're done. Kovar sends the captured session to the AI, which generates:

```
tests/
  pages/
    login.page.ts          # Page object class
    dashboard.page.ts      # One per page visited
  login-dashboard.spec.ts  # Test spec
  .env.example             # Credential template
```

5. Fill in `.env.example` with real test credentials, rename to `.env`, and run:

```bash
npx playwright test login-dashboard.spec.ts
```

### What Gets Generated

**Page object** (`tests/pages/login.page.ts`):

```typescript
import type { Page } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  private get emailInput() {
    return this.page.getByRole("textbox", { name: "Email" });
  }
  private get passwordInput() {
    return this.page.getByRole("textbox", { name: "Password" });
  }
  private get submitButton() {
    return this.page.getByRole("button", { name: "Sign In" });
  }

  async navigate() {
    await this.page.goto(`${process.env.BASE_URL}/login`);
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

**Test spec** (`tests/login-dashboard.spec.ts`):

```typescript
import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/login.page";

const BASE_URL = process.env.BASE_URL ?? "";
const EMAIL = process.env.TEST_EMAIL ?? "";
const PASSWORD = process.env.TEST_PASSWORD ?? "";

test("user logs in and views dashboard", async ({ page }) => {
  const loginPage = new LoginPage(page);

  // Intent: Navigate and authenticate
  await loginPage.navigate();
  await loginPage.login(EMAIL, PASSWORD);

  // Intent: Verify successful login
  await expect(page).toHaveURL(/dashboard/);
});
```

**Environment template** (`tests/.env.example`):

```bash
# Test credentials -- copy to .env and fill in real values
BASE_URL=https://your-app.com
TEST_EMAIL=your-email@example.com
TEST_PASSWORD=your-password
```

Key qualities of generated code:
- **No hardcoded URLs** -- the app origin is replaced with `process.env.BASE_URL`
- **No hardcoded credentials** -- passwords, emails, and tokens use `process.env.*` variables
- **Resilient locators** -- prefers `getByRole` > `getByText` > `getByTestId` > `getByPlaceholder` > CSS selectors
- **One page object per page** -- class names inferred from URL paths (`/login` -> `LoginPage`, `/dashboard` -> `DashboardPage`)
- **Intent comments** -- `// Intent:` comments group logical action sequences in the spec

### CLI Reference

```bash
kovar record <url> [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output <dir>` | `-o` | Output directory for generated files | `./tests` |
| `--name <name>` | `-n` | Test file name (without extension) | Auto-generated from URL path |
| `--source <dir>` | `-s` | Source directory for codebase-aware locators | Off |
| `--provider <name>` | | LLM provider: `anthropic` or `openai` | Auto-detect from env |
| `--model <name>` | | LLM model override | `claude-sonnet-4-20250514` or `gpt-4o` |
| `--help` | `-h` | Show help | |

Examples:

```bash
# Basic recording
kovar record https://your-app.com

# Custom output directory and test name
kovar record https://your-app.com -o ./e2e -n checkout-flow

# With codebase awareness for better locators
kovar record https://your-app.com --source ./src

# Use a specific provider/model
kovar record https://your-app.com --provider openai --model gpt-4o
```

### Codebase Awareness (Beta)

With the `--source` flag, Kovar maps UI elements back to their source components to generate higher-confidence selectors. Instead of guessing from the DOM alone, it reads your JSX to find `data-testid`, `aria-label`, and event handlers from the actual component definition.

**Vite setup:**

```typescript
// vite.config.ts
import { kovarSourcePlugin } from "kovar/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [kovarSourcePlugin()],
});
```

**Next.js setup:**

```javascript
// next.config.js
const { withKovar } = require("kovar/next");

module.exports = withKovar({
  // your existing config
});
```

Then create a `.babelrc` in your project root:

```json
{
  "presets": ["next/babel"],
  "plugins": ["kovar/babel"]
}
```

> `withKovar` disables SWC in dev mode to allow the Babel plugin to inject source attributes. This adds ~2-5 seconds to dev startup. Production builds are unaffected.

**How it works:**

1. The build plugin injects `data-kovar-source` attributes into JSX elements at compile time (file path, component name, line number).
2. During recording, the recorder reads these attributes from the live DOM.
3. The AST parser extracts component metadata (testId, ariaLabel, event handlers) from source files.
4. The `LocatorStrategy` scores each selector candidate by confidence (0.4-0.97) and picks the best one.
5. Generated tests use standard Playwright locators -- no `data-kovar-*` attributes leak into test output.

Confidence levels:

| Source | Confidence | Example |
|--------|------------|---------|
| Source-verified testId | 0.97 | `page.getByTestId("submit-btn")` |
| Source-verified role + aria-label | 0.95 | `page.getByRole("button", { name: "Submit" })` |
| DOM testId | 0.95 | `page.getByTestId("submit-btn")` |
| DOM role + aria-label | 0.90 | `page.getByRole("button", { name: "Submit" })` |
| Short visible text | 0.70 | `page.getByText("Submit")` |
| CSS selector fallback | 0.40 | `page.locator(".btn-primary")` |

### How the Recorder Works

1. **Launches Chromium** with anti-bot detection bypass (`navigator.webdriver` override, standard Chrome user agent). Works on Cloudflare-protected sites.
2. **Captures actions** in the browser via an injected script: clicks, inputs, selects, keypresses, and SPA navigations (pushState/replaceState). Actions are debounced (50ms for clicks, 300ms for inputs).
3. **Captures network** requests (fetch/xhr only). Filters out analytics, tracking, fonts, images, and static assets. Limits: 500 requests max, 10KB body per request.
4. **Masks credentials** before anything is sent to the AI: passwords, emails, credit cards, JWTs, phone numbers, and SSN-like patterns are all replaced with tokens like `[PASSWORD]`, `[EMAIL]`, `[TOKEN]`. Network responses are also sanitized (JWTs, emails, sensitive JSON keys redacted).
5. **Sends to AI** with a structured prompt: actions grouped by page, suggested locator strategies, API calls prioritized by mutation type. Dynamic token budgeting keeps costs low (~$0.05-0.15/session on Claude Sonnet).
6. **Validates output**: rejects generated code containing `eval()`, `require()`, `child_process`, `fs` operations, hardcoded secrets, or missing assertions.
7. **Writes files**: page objects, spec, and `.env.example`. If AI generation fails, saves the raw recording as JSON for manual use or retry.

Session limits:
- Max 200 actions (configurable)
- Max 30 minutes duration
- Auto-stops after 5 minutes of inactivity

### Recorder Tips

- **Log in first** -- if your app requires authentication, the recording captures the login flow and extracts credentials into `process.env.*` variables.
- **Use `--name`** for meaningful file names. Without it, the name is derived from the URL path (e.g., `/checkout/payment` -> `checkout-payment.spec.ts`).
- **Use `--source`** for React/Vue/Svelte apps. The confidence jump from 0.4 (CSS) to 0.97 (source-verified testId) makes a real difference in test stability.
- **Review generated code** before committing. The AI is good but not perfect -- you may want to adjust assertions or add waits.
- **Add `.recording` to `.gitignore`** -- if AI generation fails, the fallback JSON file contains session data (sanitized but rich with URLs, element text, and form field names).

---

## Limitations

Kovar is a **security regression testing** tool, not a comprehensive security scanner. It catches common misconfigurations and prevents regressions. It does not replace professional security testing.

### What it catches

- Missing or misconfigured HTTP security headers (12 OWASP-aligned checks)
- Weak cookie security flags (Secure, HttpOnly, SameSite, prefix validation)
- Overly permissive CSP (wildcards, unsafe-inline without nonces, unsafe-eval)
- Reflected XSS via form inputs (40 polyglot payloads, API-first and DOM testing)

### What it does NOT catch

- DOM-based XSS that doesn't trigger `alert()`
- Stored XSS
- Blind injection vulnerabilities (time-based, out-of-band)
- CSRF token validation, CORS misconfiguration, open redirects (coming in v0.2)
- Authentication/session management flaws
- Authorization/privilege escalation
- Server-side vulnerabilities (SSRF, SSTI, deserialization)
- Dependency vulnerabilities
- Business logic flaws
- TLS/SSL configuration
- Forms inside iframes or Shadow DOM

### XSS detection specifics

- API-first testing detects reflected payloads in response bodies
- DOM testing relies on `alert()` dialog detection (may miss non-alerting XSS)
- 40 polyglot payloads across 3 depth levels:
  - `quick` (10 payloads) -- common HTML injection contexts
  - `standard` (25 cumulative) -- adds encoding evasion, case mixing, attribute breakouts
  - `thorough` (40 cumulative) -- adds unicode escapes, data URIs, context breakouts, polyglot all-context payload

### Recommended complements

- SAST: Semgrep, SonarQube, CodeQL
- DAST: OWASP ZAP, Burp Suite, StackHawk
- Dependencies: Snyk, npm audit, Dependabot
- Manual penetration testing by security professionals

## License

Apache 2.0
