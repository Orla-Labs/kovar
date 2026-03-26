---
title: XSS
description: Test form inputs against reflected XSS payloads with toBeResilientToXSS
---

The `toBeResilientToXSS()` matcher tests form inputs against XSS payloads. By default it uses **API-first injection** -- submitting payloads via HTTP and analyzing response bodies for unescaped reflection, without causing DOM side effects. It falls back to DOM testing with `alert()` dialog detection when needed.

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("search form resists XSS", async ({ page }) => {
  await page.goto("/search");
  await expect(page).toBeResilientToXSS({
    selector: "#search-form",
    depth: "quick",
  });
});
```

## Payload Depth Levels

40 polyglot payloads across 3 depth levels:

| Depth | Payloads | What it tests |
|-------|----------|---------------|
| `quick` | 10 | Common HTML injection: `<img onerror>`, `<svg onload>`, `<script>`, attribute breakouts, `javascript:` protocol, template literals |
| `standard` | 25 (cumulative) | + encoding evasion, mixed case, null bytes, newlines in handlers, comment breakouts, quote-style variations |
| `thorough` | 40 (cumulative) | + unicode escapes, HTML entity encoding, data URIs, base64, context breakouts (textarea, title, style, noscript), polyglot all-context |

## Options

```typescript
await expect(page).toBeResilientToXSS({
  selector: "#login-form",       // target a specific form (optional, auto-discovers all forms)
  depth: "standard",             // "quick" | "standard" | "thorough" (default: "quick")
  timeout: 5000,                 // per-payload timeout in ms
  skipPayloads: ["poly-009"],    // skip specific payload IDs
  apiFirst: false,               // set false to use DOM testing instead of API-first
});
```

| Option | Type | Description |
|--------|------|-------------|
| `selector` | `string` | CSS selector for a specific form (auto-discovers all forms if omitted) |
| `depth` | `"quick" \| "standard" \| "thorough"` | Payload depth level (default: `"quick"`) |
| `timeout` | `number` | Per-payload timeout in milliseconds |
| `skipPayloads` | `string[]` | Payload IDs to skip |
| `apiFirst` | `boolean` | Use API-first injection (default: `true`) |
| `delayBetweenPayloads` | `number` | Delay in ms between payload submissions (default: `0`) |
| `concurrency` | `number` | Max parallel payload tests (default: `1`, serial) |

## API-First vs DOM Testing

**API-first** (default) submits payloads directly via HTTP requests to form action URLs and checks response bodies for unescaped reflection. This is faster and doesn't cause visual side effects in the browser.

**DOM testing** (set `apiFirst: false`) fills form inputs in the browser, submits the form, and listens for `alert()` dialogs. This catches payloads that execute in the browser context but is slower and may miss non-alerting XSS.

## Using the Fixture

XSS testing is opt-in in the [full audit](/api/audit) because it's slower than other checks:

```typescript
test("XSS via audit", async ({ page, security }) => {
  await page.goto("/search");

  const report = await security.audit({
    includeXSS: true,
    xss: { selector: "#search-form", depth: "standard" },
  });

  expect(report.summary.critical).toBe(0);
});
```

## Related

- [Full Audit](/api/audit) -- include XSS testing in a comprehensive audit.
- [Standalone API](/api/standalone) -- use `XSSScanner` outside Playwright test runner.
- [Limitations](/reference/limitations) -- what XSS patterns Kovar does and does not catch.
