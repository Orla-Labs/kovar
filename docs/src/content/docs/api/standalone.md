---
title: Standalone API
description: Use Kovar's check functions outside the Playwright test runner
---

Kovar's check functions can be used outside the Playwright test runner -- in scripts, CI pipelines, or custom tooling. Import from the `/core` subpath.

## Basic Usage

```typescript
import { chromium } from "playwright";
import { analyzeHeaders, analyzeCookies, mapPlaywrightCookies, XSSScanner } from "@orlalabs/kovar/core";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const response = await page.goto("https://your-app.com");

// Check headers
const headerFindings = analyzeHeaders(response!.headers());
for (const f of headerFindings) {
  console.log(`[${f.severity}] ${f.message}`);
  console.log(`  Fix: ${f.remediation}`);
}

// Check cookies
const cookies = await context.cookies();
const cookieFindings = analyzeCookies(mapPlaywrightCookies(cookies));

// Run XSS scan
const scanner = new XSSScanner(page, context.request);
const xssResult = await scanner.scan({ depth: "quick" });

await browser.close();
```

## Available Exports

### Core Checks

```typescript
import { analyzeHeaders, analyzeCookies, mapPlaywrightCookies, XSSScanner } from "@orlalabs/kovar/core";
```

| Export | Description |
|--------|-------------|
| `analyzeHeaders(headers)` | Analyze response headers, returns `SecurityFinding[]` |
| `analyzeCookies(cookies)` | Analyze cookie security flags, returns `SecurityFinding[]` |
| `mapPlaywrightCookies(cookies)` | Convert Playwright cookies to Kovar's format |
| `XSSScanner` | XSS scanning class with `.scan()` method |

### API Security Checks

```typescript
import { checkCSRF, checkCORS, checkAuth, checkAccessibility } from "@orlalabs/kovar/core";
```

| Export | Description |
|--------|-------------|
| `checkCSRF(request, url, options?)` | Test CSRF protection |
| `checkCORS(request, url, options?)` | Test CORS configuration |
| `checkAuth(request, url, options?)` | Test authentication enforcement |
| `checkAccessibility(page, options?)` | Test accessibility rules |

### Auto-Remediation

```typescript
import { generateRemediation } from "@orlalabs/kovar/core";
```

See [Auto-Remediation](/remediation/overview) for usage.

### Compliance Evaluation

```typescript
import { evaluateASVS, evaluatePCIDSS, formatComplianceReport } from "@orlalabs/kovar/core";
```

See [OWASP ASVS](/compliance/owasp-asvs) and [PCI-DSS](/compliance/pci-dss) for usage.

## Finding Shape

Every check function returns `SecurityFinding[]`. Each finding has a consistent shape:

```typescript
interface SecurityFinding {
  id: string;                  // e.g. "header-missing-hsts", "csrf-unprotected-endpoint"
  category: FindingCategory;   // e.g. "headers", "cookies", "xss"
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;             // human-readable description
  remediation: string;         // how to fix
  url?: string;                // for endpoint-level findings
  header?: string;             // for header findings
  cookie?: string;             // for cookie findings
  payload?: string;            // for XSS findings
  evidence?: string;           // for XSS findings
  cweId?: string;              // e.g. "CWE-352", "CWE-942"
  cvssScore?: number;          // CVSS v3.1 base score (0-10)
  cvssVector?: string;         // CVSS v3.1 vector string
  references?: string[];       // links to relevant standards or docs
}
```

See [SecurityFinding](/reference/types) for the full type reference.

## Related

- [Security Fixture](/api/fixture) -- use checks within Playwright tests.
- [Full Audit](/api/audit) -- run all checks at once within a test.
- [Auto-Remediation](/remediation/overview) -- generate fixes from findings.
