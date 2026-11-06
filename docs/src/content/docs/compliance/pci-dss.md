---
title: PCI-DSS
description: Map security findings against PCI-DSS 4.0 requirements
---

Kovar maps your security findings against PCI-DSS requirement IDs related to web application security.

:::caution[Read before relying on this report]
- **"pass" means "no matching finding", not "verified".** A requirement is marked `pass` whenever the findings you pass in contain nothing for it -- including when the relevant check never ran. For example, the default `security.audit()` runs only headers and cookies, so the XSS requirement shows `pass` without a single payload being sent, and the summary still reports `Not tested: 0` and `Coverage: 100%`. Only evaluate findings from checks you actually ran, and read `pass` accordingly.
- **Requirement IDs have not been verified against PCI DSS 4.0.1.** In particular, `6.5.4` (mapped to XSS) and `6.5.10` (mapped to session cookies) need checking: as far as we know, section 6.5 in 4.0 covers change management, and the common-vulnerability list numbered 6.5.x belonged to earlier versions. Treat these IDs as hints, not citations.
- This is evidence for an assessor, not an attestation of compliance.
:::

## Basic Usage

```typescript
import { evaluatePCIDSS, formatComplianceReport } from "@orlalabs/kovar/core";

const report = evaluatePCIDSS(findings);
const text = formatComplianceReport(report, "text");
console.log(text);
```

## Requirements Covered

PCI-DSS evaluation lists 6 requirement IDs (`6.2.4`, `6.4.1`, `6.4.2`, `4.2.1`, `6.5.4`, `6.5.10`) related to:

- XSS prevention
- HTTP security headers
- Content Security Policy
- HSTS (HTTP Strict Transport Security)
- Cookie security

## Output Formats

Use `formatComplianceReport` to format the report:

```typescript
// Markdown for documentation
const markdown = formatComplianceReport(report, "markdown");

// Plain text for terminal output
const text = formatComplianceReport(report, "text");

// Structured JSON for programmatic use
const json = formatComplianceReport(report, "json");
```

See [Report Formats](/compliance/reports) for details on each format.

## Integration with Audit

```typescript
import { test, expect } from "@orlalabs/kovar";
import { evaluatePCIDSS } from "@orlalabs/kovar/core";

test("meets PCI-DSS requirements", async ({ page, security }) => {
  await page.goto("/checkout");
  const report = await security.audit();

  const pci = evaluatePCIDSS(report.findings);
  const failed = pci.requirements.filter((r) => r.status === "fail");
  expect(failed).toHaveLength(0);
});
```

## Related

- [OWASP ASVS](/compliance/owasp-asvs) -- OWASP ASVS compliance evaluation.
- [Report Formats](/compliance/reports) -- output format details.
- [Full Audit](/api/audit) -- generate findings for compliance evaluation.
- [Standalone API](/api/standalone) -- use `evaluatePCIDSS()` in scripts.
