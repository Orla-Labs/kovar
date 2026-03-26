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
- **Full audit** -- `security.audit()` runs all checks at once and returns a structured report.

All standard Playwright APIs (`page`, `context`, `request`, `expect`) continue to work exactly as before.

## Optional: Reporter

Add the Kovar reporter to your Playwright config for a security summary after each test run:

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
