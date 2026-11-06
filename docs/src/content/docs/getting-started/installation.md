---
title: Installation
description: How to install and set up Kovar in your Playwright project
---

## Install

```bash
npm install -D @orlalabs/kovar
```

Kovar requires `@playwright/test` >= 1.40.0 as a peer dependency. If you don't have Playwright installed yet:

```bash
npm install -D @playwright/test
npx playwright install
```

Kovar's examples use relative paths like `page.goto("/login")`, so your Playwright config needs a `baseURL` (and usually a `webServer` that starts your app). Without one, the first test fails with `Cannot navigate to invalid URL`:

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
```

## Setup

Replace your Playwright import with Kovar:

```typescript
// Replace this:
import { test, expect } from "@playwright/test";

// With this:
import { test, expect } from "@orlalabs/kovar";
```

That's it. Your existing tests still work, and you now have access to security matchers and the `security` fixture.

## What You Get

After swapping the import, you can use:

- **Security matchers** on `expect()` -- `toHaveSecureHeaders()`, `toHaveSecureCookies()`, `toBeResilientToXSS()`, `toBeCSRFProtected()`, `toHaveSecureCORS()`, `toRequireAuthentication()`, `toBeAccessible()`.
- **The `security` fixture** -- programmatic access to all checks with `assert()` and `check()` modes.
- **Full audit** -- `security.audit()` runs the default checks (headers and cookies; others are opt-in) and returns a structured report.

All standard Playwright APIs (`page`, `context`, `request`, `expect`) continue to work exactly as before.

## Optional: Reporter

Add the Kovar reporter to your Playwright config for a security summary after each test run. The reporter only counts findings from the `security` fixture (`security.*.check()/assert()` and `security.audit()`); `expect(...)` matchers do not feed it, so a suite that uses only matchers prints no score card.

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["list"], ["@orlalabs/kovar/reporter"]],
});
```

See [Reporter](/ci/reporter) for details.

## Optional: Standalone API

To use Kovar's check functions outside the Playwright test runner (in scripts, CI pipelines, or custom tooling), import from the `/core` subpath:

```typescript
import { analyzeHeaders, analyzeCookies } from "@orlalabs/kovar/core";
```

See [Standalone API](/api/standalone) for the full list of exports.

## Next Steps

- Follow the [Quick Start](/getting-started/quick-start) guide for your first security test.
- Learn about individual checks: [Headers](/checks/headers), [Cookies](/checks/cookies), [XSS](/checks/xss).
