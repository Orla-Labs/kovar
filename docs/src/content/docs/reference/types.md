---
title: SecurityFinding
description: Type reference for SecurityFinding, FindingCategory, and SecurityReport
---

All Kovar check functions return arrays of `SecurityFinding` objects. This page documents the core types.

## SecurityFinding

```typescript
interface SecurityFinding {
  id: string;                  // e.g. "header-missing-hsts", "csrf-unprotected-endpoint"
  category: FindingCategory;   // see FindingCategory below
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

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique finding identifier (e.g. `"header-missing-hsts"`) |
| `category` | `FindingCategory` | Finding category (see below) |
| `severity` | `string` | One of: `"critical"`, `"high"`, `"medium"`, `"low"`, `"info"` |
| `message` | `string` | Human-readable description of the issue |
| `remediation` | `string` | How to fix the issue |
| `url` | `string?` | Affected URL (for endpoint-level findings) |
| `header` | `string?` | Affected header name (for header findings) |
| `cookie` | `string?` | Affected cookie name (for cookie findings) |
| `payload` | `string?` | XSS payload that triggered the finding |
| `evidence` | `string?` | Evidence of XSS reflection |
| `cweId` | `string?` | CWE identifier (e.g. `"CWE-352"`) |
| `cvssScore` | `number?` | CVSS v3.1 base score (0-10) |
| `cvssVector` | `string?` | CVSS v3.1 vector string |
| `references` | `string[]?` | Links to relevant standards or documentation |

## FindingCategory

```typescript
type FindingCategory =
  | "headers"
  | "cookies"
  | "xss"
  | "authentication"
  | "access-control"
  | "injection"
  | "cryptography"
  | "configuration"
  | "secrets"
  | "information-disclosure";
```

## Severity

Severity levels from most to least severe:

| Level | Description | Score Impact |
|-------|-------------|-------------|
| `critical` | Immediate risk, must fix before deployment | -20 |
| `high` | Serious risk, fix soon | -10 |
| `medium` | Moderate risk, should fix | -5 |
| `low` | Minor risk, fix when convenient | -2 |
| `info` | Informational, no direct risk | 0 |

## SecurityReport

Returned by `security.audit()`:

```typescript
interface SecurityReport {
  url: string;                                    // URL that was audited
  timestamp: string;                              // ISO 8601 timestamp
  duration: number;                               // Audit duration in milliseconds
  findings: SecurityFinding[];                    // All findings
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}
```

## Related

- [Standalone API](/api/standalone) -- functions that return `SecurityFinding[]`.
- [Full Audit](/api/audit) -- get a `SecurityReport`.
- [Auto-Remediation](/remediation/overview) -- generate fixes from findings.
