---
title: Accessibility
description: Test pages for common accessibility issues with toBeAccessible
---

The `toBeAccessible()` matcher tests the page for common accessibility issues based on WCAG 2.1 guidelines. Pass a Playwright `Page`. The checker evaluates the live DOM, so it catches issues that static analysis tools miss -- dynamically rendered content, SPA state, and computed styles.

## Basic Usage

```typescript
import { test, expect } from "@orlalabs/kovar";

test("dashboard is accessible", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toBeAccessible();
});
```

## Rules Checked

10 rules are evaluated:

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

By default, info-level findings (like color contrast warnings) are excluded. Pass `includeWarnings: true` to include them.

## Options

```typescript
await expect(page).toBeAccessible({
  skip: ["a11y-color-contrast"],     // skip specific rules by ID
  only: ["a11y-img-alt"],            // check only these rules
  includeWarnings: true,             // include info-level findings (default: false)
});
```

| Option | Type | Description |
|--------|------|-------------|
| `skip` | `string[]` | Rule IDs to skip |
| `only` | `string[]` | Check only these rule IDs |
| `includeWarnings` | `boolean` | Include info-level findings (default: `false`) |

## Using the Fixture

```typescript
import { test, expect } from "@orlalabs/kovar";

test("accessibility with warnings", async ({ page, security }) => {
  await page.goto("/dashboard");
  const findings = await security.accessibility.check({ includeWarnings: true });

  // Filter by specific rules
  const labelIssues = findings.filter((f) => f.id === "a11y-input-label");
  expect(labelIssues).toHaveLength(0);
});
```

## Related

- [Full Audit](/api/audit) -- include accessibility in a comprehensive audit with `checks: ["accessibility"]`.
- [Standalone API](/api/standalone) -- use `checkAccessibility()` outside Playwright.
- [OWASP ASVS](/compliance/owasp-asvs) -- accessibility findings can be mapped to compliance requirements.
