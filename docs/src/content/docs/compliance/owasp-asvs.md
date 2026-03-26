---
title: OWASP ASVS
description: Map security findings against OWASP ASVS 4.0.3 requirements
---

Kovar maps your security findings against the OWASP Application Security Verification Standard (ASVS) 4.0.3. This lets you track compliance progress and generate compliance reports.

## Basic Usage

```typescript
import { evaluateASVS, formatComplianceReport } from "@orlalabs/kovar/core";

const report = evaluateASVS(findings, { level: 1 }); // Level 1, 2, or 3

// Output as markdown, text, or JSON
const markdown = formatComplianceReport(report, "markdown");
console.log(markdown);
```

## ASVS Levels

| Level | Requirements Covered | What's Checked |
|-------|---------------------|----------------|
| Level 1 | 10 | Headers, CSP, cookies, XSS |
| Level 2 | + additional | HSTS max-age, cookie expiry, Permissions-Policy |
| Level 3 | + additional | Cross-origin isolation (COOP/CORP/COEP) |

Each level is cumulative -- Level 2 includes all Level 1 requirements, and Level 3 includes all Level 2 requirements.

## Report Output

The `evaluateASVS` function returns a structured report that you can format in three ways using `formatComplianceReport`:

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

## Integration with Audit

A typical workflow is to run a full audit first, then evaluate compliance:

```typescript
import { test, expect } from "@orlalabs/kovar";
import { evaluateASVS, formatComplianceReport } from "@orlalabs/kovar/core";

test("meets ASVS Level 1", async ({ page, security }) => {
  await page.goto("/dashboard");
  const report = await security.audit();

  const asvs = evaluateASVS(report.findings, { level: 1 });
  const failed = asvs.requirements.filter((r) => r.status === "fail");
  expect(failed).toHaveLength(0);
});
```

## Related

- [PCI-DSS](/compliance/pci-dss) -- PCI-DSS compliance evaluation.
- [Report Formats](/compliance/reports) -- output format details.
- [Full Audit](/api/audit) -- generate findings for compliance evaluation.
- [Standalone API](/api/standalone) -- use `evaluateASVS()` in scripts.
