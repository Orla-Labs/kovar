# Kovar

Security testing assertions + AI-powered test recording for Playwright. Add security checks to your E2E tests without being a security expert, and record browser sessions that generate production-grade Page Object Model tests.

## Install

```bash
npm install -D @orlalabs/kovar
```

## Quick Start

Replace your Playwright import with Kovar -- everything else stays the same:

```typescript
import { test, expect } from "@orlalabs/kovar"; // was: '@playwright/test'

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

## Features

### Security Checks

- **[HTTP Headers](https://kovar.orlalabs.com/checks/headers)** -- 12 OWASP-aligned header checks with CSP validation
- **[Cookie Flags](https://kovar.orlalabs.com/checks/cookies)** -- session cookie security (Secure, HttpOnly, SameSite, prefix validation)
- **[Reflected XSS](https://kovar.orlalabs.com/checks/xss)** -- 40 polyglot payloads with API-first and DOM testing
- **[CSRF Protection](https://kovar.orlalabs.com/checks/csrf)** -- verifies state-changing endpoints reject tokenless requests
- **[CORS Configuration](https://kovar.orlalabs.com/checks/cors)** -- tests for origin reflection and wildcard misconfigurations
- **[Authentication](https://kovar.orlalabs.com/checks/auth)** -- verifies protected endpoints reject unauthenticated requests
- **[Accessibility](https://kovar.orlalabs.com/checks/accessibility)** -- 10 WCAG 2.1 rules covering images, forms, landmarks, headings

### Fixtures & API

- **[Security Fixture](https://kovar.orlalabs.com/api/fixture)** -- programmatic access to all checks with `assert()` and `check()` modes
- **[Full Audit](https://kovar.orlalabs.com/api/audit)** -- run all checks at once and get a structured report
- **[Standalone API](https://kovar.orlalabs.com/api/standalone)** -- use check functions outside the Playwright test runner

### Remediation & Compliance

- **[Auto-Remediation](https://kovar.orlalabs.com/remediation/overview)** -- framework-specific fix suggestions (Express, Fastify, Next.js, Koa, Hono)
- **[OWASP ASVS](https://kovar.orlalabs.com/compliance/owasp-asvs)** -- map findings to ASVS 4.0.3 requirements
- **[PCI-DSS](https://kovar.orlalabs.com/compliance/pci-dss)** -- map findings to PCI-DSS 4.0 requirements

### CI/CD

- **[GitHub Action](https://kovar.orlalabs.com/ci/github-action)** -- run security checks in CI with PR comments
- **[Baseline Tracking](https://kovar.orlalabs.com/ci/baseline)** -- detect regressions across PRs
- **[Reporter](https://kovar.orlalabs.com/ci/reporter)** -- Playwright reporter with security score cards

### AI Recorder

- **[Record browser sessions](https://kovar.orlalabs.com/recorder/getting-started)** -- capture interactions and generate Page Object Model tests
- **[Self-Healing](https://kovar.orlalabs.com/recorder/self-healing)** -- auto-fix test failures after recording
- **[Codebase Awareness](https://kovar.orlalabs.com/recorder/codebase-awareness)** -- source-verified locators for higher test stability

## Documentation

Full documentation is available at **[kovar.dev](https://kovar.orlalabs.com)**.

## License

Apache 2.0
