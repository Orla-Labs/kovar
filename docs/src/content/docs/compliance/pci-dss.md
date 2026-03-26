---
title: PCI-DSS
description: Map security findings against PCI-DSS 4.0 requirements
---

Kovar maps your security findings against PCI-DSS 4.0 requirements related to web application security.

## Basic Usage

```typescript
import { evaluatePCIDSS, formatComplianceReport } from "@orlalabs/kovar/core";

const report = evaluatePCIDSS(findings);
const text = formatComplianceReport(report, "text");
console.log(text);
```

## Requirements Covered

PCI-DSS evaluation covers 6 requirements related to:

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
