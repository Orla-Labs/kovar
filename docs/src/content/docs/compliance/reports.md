---
title: Report Formats
description: Compliance report output formats -- markdown, text, and JSON
---

Kovar supports three output formats for compliance reports via the `formatComplianceReport` function.

## Usage

```typescript
import { evaluateASVS, formatComplianceReport } from "@orlalabs/kovar/core";

const report = evaluateASVS(findings, { level: 1 });

// Choose a format:
const markdown = formatComplianceReport(report, "markdown");
const text = formatComplianceReport(report, "text");
const json = formatComplianceReport(report, "json");
```

## Markdown Format

Full report with headings, tables, and remediation details. Ideal for documentation, wiki pages, or PR comments.

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

## Text Format

Plain text output for terminal display. Compact and readable in CI logs.

## JSON Format

Structured JSON for programmatic consumption. Useful for:

- Storing results in a database
- Building custom dashboards
- Integrating with other tools
- Tracking compliance over time

## Related

- [OWASP ASVS](/compliance/owasp-asvs) -- ASVS compliance evaluation.
- [PCI-DSS](/compliance/pci-dss) -- PCI-DSS compliance evaluation.
- [Reporter](/ci/reporter) -- Playwright reporter for security score cards.
