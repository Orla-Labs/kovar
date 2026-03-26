---
title: Introduction
description: What is Kovar and why use it for security testing in Playwright
---

Kovar is a security testing assertions library and AI-powered test recorder for Playwright. It lets you add security checks to your E2E tests without being a security expert, and record browser sessions that generate production-grade Page Object Model tests.

## What Kovar Does

Kovar extends Playwright's `test` and `expect` with security-specific fixtures and matchers. Replace your Playwright import with Kovar, and your existing tests continue to work unchanged -- you just get security superpowers on top.

```typescript
import { test, expect } from "@orlalabs/kovar"; // was: '@playwright/test'

test("login page has secure headers", async ({ page }) => {
  const response = await page.goto("/login");
  await expect(response!).toHaveSecureHeaders();
});
```

## Features

Kovar's security module checks seven categories:

- **HTTP Headers** -- 12 OWASP-aligned header checks with CSP validation. See [Headers](/checks/headers).
- **Cookie Flags** -- Session cookie security (Secure, HttpOnly, SameSite, prefix validation). See [Cookies](/checks/cookies).
- **Reflected XSS** -- 40 polyglot payloads with API-first and DOM testing. See [XSS](/checks/xss).
- **CSRF Protection** -- Verifies state-changing endpoints reject tokenless requests. See [CSRF](/checks/csrf).
- **CORS Configuration** -- Tests for origin reflection, wildcard misconfigurations. See [CORS](/checks/cors).
- **Authentication Enforcement** -- Verifies protected endpoints reject unauthenticated requests. See [Authentication](/checks/auth).
- **Accessibility** -- 10 WCAG 2.1 rules covering images, forms, landmarks, headings. See [Accessibility](/checks/accessibility).

Beyond security checks, Kovar also provides:

- **[Auto-Remediation](/remediation/overview)** -- Framework-specific fix suggestions for every finding.
- **[Compliance Testing](/compliance/owasp-asvs)** -- Map findings to OWASP ASVS 4.0.3 and PCI-DSS 4.0.
- **[CI/CD Integration](/ci/github-action)** -- GitHub Action with PR comments and baseline tracking.
- **[Reporter](/ci/reporter)** -- Playwright reporter with security score cards.
- **[AI Recorder](/recorder/getting-started)** -- Record browser sessions and generate Page Object Model tests with resilient locators.

## Design Principles

- **Zero runtime dependencies** -- only a peer dependency on `@playwright/test`.
- **Drop-in replacement** -- swap one import line, everything else works.
- **Layered architecture** -- pure analysis functions, Playwright matchers, and fixtures are separate layers you can use independently.
- **Actionable findings** -- findings include severity, remediation guidance, and where applicable, CWE IDs.

## Next Steps

- [Install Kovar](/getting-started/installation) in your project.
- Follow the [Quick Start](/getting-started/quick-start) guide.
- Explore individual [security checks](/checks/headers).
