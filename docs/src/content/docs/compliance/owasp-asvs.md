---
title: OWASP ASVS
description: Map security findings against OWASP ASVS 4.0.3 requirements
---

Kovar maps your security findings against the OWASP Application Security Verification Standard (ASVS) 4.0.3. This lets you track compliance progress and generate compliance reports.

:::caution[Read before relying on this report]
- **"pass" means "no matching finding", not "verified".** A requirement is marked `pass` whenever the findings you pass in contain nothing for it -- including when the relevant check never ran. For example, the default `security.audit()` runs only headers and cookies, so the XSS requirement shows `pass` without a single payload being sent, and the summary still reports `Not tested: 0` and `Coverage: 100%`. Only evaluate findings from checks you actually ran, and read `pass` accordingly.
- **Some requirement IDs are mis-mapped in 0.6.0.** Checked against the ASVS 4.0.3 text: `V14.4.4` is X-Content-Type-Options and `V14.4.5` is HSTS (Kovar has them swapped with other topics); `V14.4.1` is Content-Type/charset, `V14.4.2` is `Content-Disposition` on API responses, `V14.5.1` is HTTP method allow-listing, and `V3.4.5` is the session cookie `Path` attribute -- none of which Kovar checks, though it reports them under those IDs. `V14.4.3`, `V14.4.6`, `V14.4.7`, `V3.4.1`-`V3.4.4` and `V5.3.3` map correctly.
- ASVS 5.0 has since been released with a different numbering; these IDs are ASVS 4.0.3 only.
- This is evidence for an assessor, not an attestation of compliance.
:::

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

**Date:** 2026-11-06
**Level:** 1

## Summary
- Total requirements: 10
- Passed: 8 (80%)
- Failed: 2 (20%)
- Not tested: 0 (0%)
- Coverage: 100% (requirements testable by Kovar)

## Failed Requirements

### V14.4.1 -- HTTP Security Headers [FAIL]
- [CRITICAL] HSTS header is missing
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
