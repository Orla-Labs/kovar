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

- **[HTTP Headers](https://orla-labs.github.io/kovar/checks/headers)** -- 12 OWASP-aligned header checks with CSP validation
- **[Cookie Flags](https://orla-labs.github.io/kovar/checks/cookies)** -- session cookie security (Secure, HttpOnly, SameSite, prefix validation)
- **[Reflected XSS](https://orla-labs.github.io/kovar/checks/xss)** -- 40 polyglot payloads with API-first and DOM testing
- **[CSRF Protection](https://orla-labs.github.io/kovar/checks/csrf)** -- verifies state-changing endpoints reject tokenless requests
- **[CORS Configuration](https://orla-labs.github.io/kovar/checks/cors)** -- tests for origin reflection and wildcard misconfigurations
- **[Authentication](https://orla-labs.github.io/kovar/checks/auth)** -- verifies protected endpoints reject unauthenticated requests
- **[Accessibility](https://orla-labs.github.io/kovar/checks/accessibility)** -- 10 WCAG 2.1 rules covering images, forms, landmarks, headings

### Fixtures & API

- **[Security Fixture](https://orla-labs.github.io/kovar/api/fixture)** -- programmatic access to all checks with `assert()` and `check()` modes
- **[Full Audit](https://orla-labs.github.io/kovar/api/audit)** -- run all checks at once and get a structured report
- **[Standalone API](https://orla-labs.github.io/kovar/api/standalone)** -- use check functions outside the Playwright test runner

### Remediation & Compliance

- **[Auto-Remediation](https://orla-labs.github.io/kovar/remediation/overview)** -- framework-specific fix suggestions (Express, Fastify, Next.js, Koa, Hono)
- **[OWASP ASVS](https://orla-labs.github.io/kovar/compliance/owasp-asvs)** -- map findings to ASVS 4.0.3 requirements
- **[PCI-DSS](https://orla-labs.github.io/kovar/compliance/pci-dss)** -- map findings to PCI-DSS 4.0 requirements

### CI/CD

- **[GitHub Action](https://orla-labs.github.io/kovar/ci/github-action)** -- run security checks in CI with PR comments
- **[Baseline Tracking](https://orla-labs.github.io/kovar/ci/baseline)** -- detect regressions across PRs
- **[Reporter](https://orla-labs.github.io/kovar/ci/reporter)** -- Playwright reporter with security score cards

### AI Recorder

- **[Record browser sessions](https://orla-labs.github.io/kovar/recorder/getting-started)** -- capture interactions and generate Page Object Model tests
- **[Self-Healing](https://orla-labs.github.io/kovar/recorder/self-healing)** -- auto-fix test failures after recording
- **[Codebase Awareness](https://orla-labs.github.io/kovar/recorder/codebase-awareness)** -- source-verified locators for higher test stability

## Documentation

Full documentation is available at **[kovar.dev](https://orla-labs.github.io/kovar)**.

## License

Apache 2.0
