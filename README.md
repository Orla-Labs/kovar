# Kovar

Security testing assertions + AI-powered test recording for Playwright. Add security checks to your E2E tests without being a security expert, and record browser sessions that generate production-grade Page Object Model tests.

```
npm install -D @orlalabs/kovar
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
    - [toBeCSRFProtected](#tobecsrfprotectedurl-options)
    - [toHaveSecureCORS](#tohavesecurecorsurl-options)
    - [toRequireAuthentication](#torequireauthenticationurl-options)
    - [toBeAccessible](#tobeaccessibleoptions)
  - [Security Fixture](#security-fixture)
  - [Full Audit](#full-audit)
  - [Standalone API](#standalone-api)
  - [Reporter](#reporter)
  - [Practical Examples](#practical-examples)
- [API Security Testing](#api-security-testing)
- [Accessibility](#accessibility)
- [Auto-Remediation](#auto-remediation)
- [Compliance Testing](#compliance-testing)
- [CI/CD Integration](#cicd-integration)
- [Recorder](#recorder)
  - [Getting Started](#getting-started)
  - [What Gets Generated](#what-gets-generated)
  - [CLI Reference](#cli-reference)
  - [Self-Healing (Beta)](#self-healing-beta)
  - [Codebase Awareness (Beta)](#codebase-awareness-beta)
  - [How the Recorder Works](#how-the-recorder-works)
  - [Recorder Tips](#recorder-tips)
- [Limitations](#limitations)
- [License](#license)

---

## Quick Start

Replace your Playwright import with Kovar -- everything else stays the same:

```typescript
import { test, expect } from "@orlalabs/kovar"; // was: '@playwright/test'

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

Kovar extends Playwright's `test` and `expect` with security-specific fixtures and matchers. All your existing tests continue to work unchanged.

---

## Security Module

Kovar's security module checks seven categories: **HTTP headers**, **cookie flags**, **reflected XSS**, **CSRF protection**, **CORS configuration**, **authentication enforcement**, and **accessibility**. Each category works as a Playwright matcher, a programmatic fixture method, or a standalone function.

### Setup

```typescript
// Replace this:
import { test, expect } from "@playwright/test";

// With this:
import { test, expect } from "@orlalabs/kovar";
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

#### `toBeCSRFProtected(url, options?)`

Tests that endpoints reject state-changing requests without CSRF tokens. Pass a Playwright `APIRequestContext` and a URL:

```typescript
test("API is protected against CSRF", async ({ request }) => {
  await expect(request).toBeCSRFProtected("/api/transfer");
});
```

The matcher sends state-changing HTTP methods (POST, PUT, DELETE, PATCH) without a CSRF token and checks whether the endpoint accepts them. It also verifies that CSRF tokens are present in response headers or meta tags, and that cookies use `SameSite=Strict` or `SameSite=Lax`.

CWE mapping: [CWE-352](https://cwe.mitre.org/data/definitions/352.html) (Cross-Site Request Forgery)

Options:

```typescript
await expect(request).toBeCSRFProtected("/api/transfer", {
  endpoints: ["/api/transfer", "/api/settings"],   // check multiple endpoints
  methods: ["POST", "DELETE"],                      // specific methods (default: POST, PUT, DELETE, PATCH)
  tokenHeaders: ["x-csrf-token", "x-xsrf-token"],  // custom token header names
  tokenCookies: ["csrf_token"],                     // token cookie names
  skip: ["/api/health"],                            // skip URL patterns
});
```

#### `toHaveSecureCORS(url, options?)`

Tests CORS configuration for misconfigurations. Pass a Playwright `APIRequestContext` and a URL:

```typescript
test("API has secure CORS", async ({ request }) => {
  await expect(request).toHaveSecureCORS("/api/data");
});
```

The matcher sends preflight requests with untrusted origins and checks for:

| Check | Severity |
|-------|----------|
| Reflects untrusted origin with credentials | critical |
| Wildcard origin (`*`) with credentials | critical |
| Wildcard origin (`*`) | high |
| Reflects untrusted origin without credentials | high |
| Wildcard `Access-Control-Allow-Headers` | high |
| Allows dangerous methods (PUT, DELETE, PATCH) | medium |

CWE mappings: [CWE-942](https://cwe.mitre.org/data/definitions/942.html) (Permissive CORS Policy), [CWE-346](https://cwe.mitre.org/data/definitions/346.html) (Origin Validation Error)

Options:

```typescript
await expect(request).toHaveSecureCORS("/api/data", {
  trustedOrigins: ["https://app.example.com"],        // origins that should be allowed
  dangerousOrigins: ["null", "http://evil.com"],      // origins to test against (default: ["null", "http://evil.com"])
});
```

#### `toRequireAuthentication(url, options?)`

Tests that endpoints require authentication. Pass a Playwright `APIRequestContext` and a URL:

```typescript
test("admin API requires authentication", async ({ request }) => {
  await expect(request).toRequireAuthentication("/api/admin/users");
});
```

The matcher sends requests without credentials and verifies the endpoint returns 401 or 403 instead of 2xx. It also checks for information leakage in error responses.

CWE mappings: [CWE-306](https://cwe.mitre.org/data/definitions/306.html) (Missing Authentication), [CWE-284](https://cwe.mitre.org/data/definitions/284.html) (Improper Access Control), [CWE-209](https://cwe.mitre.org/data/definitions/209.html) (Information Exposure Through Error Message)

Options:

```typescript
await expect(request).toRequireAuthentication("/api/admin/users", {
  endpoints: ["/api/admin/users", "/api/admin/settings"],  // check multiple endpoints
  methods: ["GET", "POST", "PUT", "DELETE"],               // HTTP methods to test (default: GET, POST, PUT, DELETE)
  expectedStatus: 401,                                      // expected rejection status
});
```

#### `toBeAccessible(options?)`

Tests the page for common accessibility issues. Pass a Playwright `Page`:

```typescript
test("dashboard is accessible", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toBeAccessible();
});
```

10 rules checked:

| Rule | ID | Severity | WCAG |
|------|----|----------|------|
| Images missing alt text | `a11y-img-alt` | medium | 1.1.1 Non-text Content |
| Form inputs without labels | `a11y-input-label` | high | 1.3.1 Info and Relationships |
| Buttons without accessible name | `a11y-button-name` | high | 4.1.2 Name, Role, Value |
| Missing `lang` attribute on `<html>` | `a11y-document-lang` | medium | 3.1.1 Language of Page |
| Missing `<title>` element | `a11y-page-title` | medium | 2.4.2 Page Titled |
| Links with no accessible text | `a11y-empty-links` | medium | 2.4.4 Link Purpose |
| Missing `<main>` landmark | `a11y-landmark-main` | low | 1.3.1 Info and Relationships |
| Insufficient color contrast | `a11y-color-contrast` | info | 1.4.3 Contrast (Minimum) |
| Heading hierarchy issues | `a11y-heading-order` | medium | 1.3.1 Info and Relationships |
| Autoplay media without muted | `a11y-autoplay-media` | medium | 1.4.2 Audio Control |

Options:

```typescript
await expect(page).toBeAccessible({
  skip: ["a11y-color-contrast"],     // skip specific rules by ID
  only: ["a11y-img-alt"],            // check only these rules
  includeWarnings: true,             // include info-level findings (default: false)
});
```

### Security Fixture

The `security` fixture gives programmatic access to checks with two modes:

- **`.assert()`** -- throws if any critical or high severity findings exist
- **`.check()`** -- returns all findings without throwing, so you can inspect them

```typescript
import { test, expect } from "@orlalabs/kovar";

test("verify security after login", async ({ page, security }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill("user@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/dashboard");

  // Throws on critical/high findings:
  await security.headers.assert();
  await security.cookies.assert();
  await security.csrf.assert();
  await security.auth.assert();

  // Or inspect findings manually:
  const corsFindings = await security.cors.check();
  const critical = corsFindings.filter((f) => f.severity === "critical");
  expect(critical).toHaveLength(0);

  // Accessibility checks:
  await security.accessibility.check({ includeWarnings: true });
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

Or specify exactly which checks to run (CSRF, CORS, auth, and accessibility are opt-in):

```typescript
const report = await security.audit({
  checks: ["headers", "cookies", "csrf", "cors", "auth", "accessibility"],
  csrf: { methods: ["POST", "DELETE"] },
  cors: { dangerousOrigins: ["http://evil.com"] },
  auth: { endpoints: ["/api/admin/users", "/api/admin/settings"] },
  accessibility: { includeWarnings: true },
});
```

All findings from the `security` fixture are automatically attached as JSON to the Playwright test report, so the Kovar reporter can aggregate them across your test suite.

### Standalone API

Use Kovar's check functions outside the Playwright test runner -- in scripts, CI pipelines, or custom tooling:

```typescript
import { chromium } from "playwright";
import { analyzeHeaders, analyzeCookies, mapPlaywrightCookies, XSSScanner } from "@orlalabs/kovar/core";

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

New v0.3.0 standalone exports:

```typescript
// API security checks
import { checkCSRF, checkCORS, checkAuth, checkAccessibility } from "@orlalabs/kovar/core";

// Auto-remediation
import { generateRemediation } from "@orlalabs/kovar/core";

// Compliance evaluation
import { evaluateASVS, evaluatePCIDSS, formatComplianceReport } from "@orlalabs/kovar/core";
```

Each finding has a consistent shape:

```typescript
interface SecurityFinding {
  id: string;                                        // e.g. "header-missing-hsts", "csrf-unprotected-endpoint"
  category: FindingCategory;                         // see categories below
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;                                   // human-readable description
  remediation: string;                               // how to fix
  url?: string;                                      // for endpoint-level findings
  header?: string;                                   // for header findings
  cookie?: string;                                   // for cookie findings
  payload?: string;                                  // for XSS findings
  evidence?: string;                                 // for XSS findings
  cweId?: string;                                    // e.g. "CWE-352", "CWE-942"
  cvssScore?: number;                                // CVSS v3.1 base score (0-10)
  cvssVector?: string;                               // CVSS v3.1 vector string
  references?: string[];                             // links to relevant standards or docs
}

type FindingCategory =
  | "headers"
  | "cookies"
  | "xss"
  | "authentication"
  | "access-control"
  | "injection"
  | "cryptography"
  | "configuration"
  | "secrets"
  | "information-disclosure";
```

### Reporter

Add the Kovar reporter to your Playwright config for a security summary after each test run:

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["list"], ["@orlalabs/kovar/reporter"]],
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
import { test, expect } from "@orlalabs/kovar";

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
import { test, expect } from "@orlalabs/kovar";

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

## API Security Testing

Kovar v0.3.0 adds dedicated matchers for CSRF, CORS, and authentication testing. These work at the HTTP level using Playwright's `request` fixture -- no browser rendering needed.

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

Or use the fixture for fine-grained control:

```typescript
test("API security audit", async ({ page, security }) => {
  await page.goto("/dashboard");

  const csrfFindings = await security.csrf.check({ methods: ["POST", "DELETE"] });
  const corsFindings = await security.cors.check();
  const authFindings = await security.auth.check({
    endpoints: ["/api/admin/users", "/api/admin/settings"],
  });

  const allFindings = [...csrfFindings, ...corsFindings, ...authFindings];
  const critical = allFindings.filter((f) => f.severity === "critical");
  expect(critical).toHaveLength(0);
});
```

---

## Accessibility

Kovar checks 10 common accessibility rules based on WCAG 2.1 guidelines. These run in the browser by evaluating the live DOM -- no external service required.

```typescript
import { test, expect } from "@orlalabs/kovar";

test("page meets accessibility standards", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toBeAccessible();
});

test("accessibility with warnings", async ({ page, security }) => {
  await page.goto("/dashboard");
  const findings = await security.accessibility.check({ includeWarnings: true });

  // Filter by specific rules
  const labelIssues = findings.filter((f) => f.id === "a11y-input-label");
  expect(labelIssues).toHaveLength(0);
});
```

The accessibility checker evaluates the live DOM, so it catches issues that static analysis tools miss (dynamically rendered content, SPA state, computed styles). By default, info-level findings (like color contrast warnings) are excluded -- pass `includeWarnings: true` to include them.

---

## Auto-Remediation

Generate framework-specific fix suggestions from security findings:

```typescript
import { generateRemediation } from "@orlalabs/kovar/core";

const remediation = generateRemediation(findings, {
  framework: "express",     // "express" | "fastify" | "next" | "koa" | "hono" | "generic"
  language: "typescript",   // "typescript" | "javascript"
});

for (const suggestion of remediation.suggestions) {
  console.log(`Finding: ${suggestion.findingId}`);
  console.log(`File: ${suggestion.filePath}`);
  console.log(`Fix:\n${suggestion.code}`);
}
```

**Express example output:**

```typescript
// suggestion.code for a missing HSTS header:
app.use((req, res, next) => {
	res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	next();
});
```

**Next.js example output:**

```typescript
// suggestion.code for a missing HSTS header:
headers: async () => [{
	source: "/(.*)",
	headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
}]
```

Framework auto-detection reads your `package.json` dependencies. The priority order is: Next.js > Hono > Fastify > Koa > Express > generic.

Each `RemediationSuggestion` includes:

```typescript
interface RemediationSuggestion {
  findingId: string;                        // e.g. "header-missing-hsts"
  framework: Framework;                     // detected or specified framework
  description: string;                      // human-readable explanation
  code: string;                             // copy-pasteable fix
  filePath?: string;                        // suggested file (e.g. "middleware.ts", "next.config.js")
  language: "typescript" | "javascript";
  confidence: "high" | "medium" | "low";
  references: string[];                     // links to docs
}

interface RemediationReport {
  findings: number;                         // total findings processed
  suggestions: RemediationSuggestion[];     // actionable suggestions
  unsupported: string[];                    // finding IDs without auto-remediation
}
```

---

## Compliance Testing

Map your security findings against industry standards. Kovar currently supports OWASP ASVS 4.0.3 and PCI-DSS 4.0.

### OWASP ASVS

```typescript
import { evaluateASVS, formatComplianceReport } from "@orlalabs/kovar/core";

const report = evaluateASVS(findings, { level: 1 });  // Level 1, 2, or 3

// Output as markdown, text, or JSON
const markdown = formatComplianceReport(report, "markdown");
console.log(markdown);
```

ASVS Level 1 covers 10 requirements (headers, CSP, cookies, XSS). Level 2 adds HSTS max-age, cookie expiry, and Permissions-Policy. Level 3 adds cross-origin isolation (COOP/CORP/COEP).

### PCI-DSS

```typescript
import { evaluatePCIDSS, formatComplianceReport } from "@orlalabs/kovar/core";

const report = evaluatePCIDSS(findings);
const text = formatComplianceReport(report, "text");
```

PCI-DSS evaluation covers 6 requirements related to XSS prevention, HTTP security headers, CSP, HSTS, and cookie security.

### Report formats

Three output formats are available via `formatComplianceReport`:

- `"markdown"` -- full report with headings, tables, and remediation details
- `"text"` -- plain text for terminal output
- `"json"` -- structured JSON for programmatic consumption

Example markdown output:

```markdown
# OWASP ASVS 4.0.3 Compliance Report

**Date:** 2026-03-26
**Level:** 1

## Summary
- Total requirements: 10
- Passed: 8 (80%)
- Failed: 2 (20%)
- Not tested: 0 (0%)
- Coverage: 100% (requirements testable by Kovar)

## Failed Requirements

### V14.4.1 -- HTTP Security Headers [FAIL]
- [CRITICAL] Missing Strict-Transport-Security header
```

---

## CI/CD Integration

### GitHub Action

Kovar ships a GitHub Action that runs security checks and posts findings as PR comments.

```yaml
# .github/workflows/security.yml
name: Security Check
on: [pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install chromium

      - name: Run security check
        uses: ./.github/actions/security-check
        with:
          url: "https://staging.your-app.com"
          checks: "headers,cookies"
          fail-on: "high"
          comment: "true"
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Action inputs

| Input | Description | Default |
|-------|-------------|---------|
| `url` | URL to check (required) | -- |
| `checks` | Comma-separated checks to run | `headers,cookies` |
| `fail-on` | Minimum severity to fail: `critical`, `high`, `medium`, `low` | `high` |
| `comment` | Post findings as PR comment | `true` |
| `github-token` | GitHub token for PR comments | `${{ github.token }}` |

### Action outputs

| Output | Description |
|--------|-------------|
| `score` | Security score (0-100) |
| `findings-count` | Total number of findings |
| `passed` | Whether the check passed (`true`/`false`) |

### PR comment format

When `comment` is enabled, Kovar posts a structured comment on the PR with:

- Security score (0-100)
- Pass/fail status based on the severity threshold
- Summary table of findings by severity
- Expandable details for each finding with CWE references and remediation guidance

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
| `--heal` | | After generating tests, run them and use AI to fix failures | Off |
| `--heal-attempts <n>` | | Maximum number of self-healing attempts | `3` |
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

# Record, then auto-fix any test failures
kovar record https://your-app.com --heal

# Allow up to 5 healing attempts
kovar record https://your-app.com --heal --heal-attempts 5
```

### Self-Healing (Beta)

When you pass `--heal`, Kovar runs the generated test immediately after recording. If the test fails, it sends the failure output back to the AI, which rewrites the test code to fix the issue. This loop repeats up to `--heal-attempts` times (default: 3).

```bash
kovar record https://your-app.com --heal
```

Typical fixes the self-healing loop catches:
- Incorrect or flaky locators (element not found, wrong role name)
- Missing `await` or missing waits for navigation/network idle
- Assertion mismatches (wrong expected text or URL pattern)

Each healing attempt makes an additional LLM call, so costs scale with the number of retries. If the test still fails after all attempts, Kovar prints the last error and exits -- you can review and fix manually.

### Codebase Awareness (Beta)

With the `--source` flag, Kovar maps UI elements back to their source components to generate higher-confidence selectors. Instead of guessing from the DOM alone, it reads your JSX to find `data-testid`, `aria-label`, and event handlers from the actual component definition.

**Vite setup:**

```typescript
// vite.config.ts
import { kovarSourcePlugin } from "@orlalabs/kovar/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [kovarSourcePlugin()],
});
```

**Next.js setup:**

```javascript
// next.config.js
const { withKovar } = require("@orlalabs/kovar/next");

module.exports = withKovar({
  // your existing config
});
```

Then create a `.babelrc` in your project root:

```json
{
  "presets": ["next/babel"],
  "plugins": ["@orlalabs/kovar/babel"]
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
- CSRF protection gaps (missing tokens, weak SameSite, unprotected state-changing endpoints)
- CORS misconfigurations (origin reflection, wildcard origins, permissive headers/methods)
- Missing authentication on protected endpoints (with info-leak detection on error responses)
- Common accessibility issues (10 WCAG 2.1 rules covering images, forms, landmarks, headings)

### What it does NOT catch

- DOM-based XSS that doesn't trigger `alert()`
- Stored XSS
- Blind injection vulnerabilities (time-based, out-of-band)
- Open redirects
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
