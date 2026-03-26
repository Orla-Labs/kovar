---
title: Limitations
description: What Kovar catches, what it does not, and recommended complements
---

Kovar is a **security regression testing** tool, not a comprehensive security scanner. It catches common misconfigurations and prevents regressions. It does not replace professional security testing.

## What It Catches

- Missing or misconfigured HTTP security headers (12 OWASP-aligned checks)
- Weak cookie security flags (Secure, HttpOnly, SameSite, prefix validation)
- Overly permissive CSP (wildcards, unsafe-inline without nonces, unsafe-eval)
- Reflected XSS via form inputs (40 polyglot payloads, API-first and DOM testing)
- CSRF protection gaps (missing tokens, weak SameSite, unprotected state-changing endpoints)
- CORS misconfigurations (origin reflection, wildcard origins, permissive headers/methods)
- Missing authentication on protected endpoints (with info-leak detection on error responses)
- Common accessibility issues (10 WCAG 2.1 rules covering images, forms, landmarks, headings)

## What It Does NOT Catch

- DOM-based XSS that doesn't trigger `alert()`
- Stored XSS
- Blind injection vulnerabilities (time-based, out-of-band)
- Open redirects
- Authorization/privilege escalation
- Server-side vulnerabilities (SSRF, SSTI, deserialization)
- Dependency vulnerabilities
- Business logic flaws
- TLS/SSL configuration
- Forms inside iframes or Shadow DOM

## XSS Detection Specifics

- API-first testing detects reflected payloads in response bodies.
- DOM testing relies on `alert()` dialog detection (may miss non-alerting XSS).
- 40 polyglot payloads across 3 depth levels:
  - `quick` (10 payloads) -- common HTML injection contexts
  - `standard` (25 cumulative) -- adds encoding evasion, case mixing, attribute breakouts
  - `thorough` (40 cumulative) -- adds unicode escapes, data URIs, context breakouts, polyglot all-context payload

See [XSS](/checks/xss) for full details on XSS testing.

## Recommended Complements

For comprehensive security coverage, complement Kovar with:

- **SAST**: Semgrep, SonarQube, CodeQL
- **DAST**: OWASP ZAP, Burp Suite, StackHawk
- **Dependencies**: Snyk, npm audit, Dependabot
- **Manual penetration testing** by security professionals

## Related

- [Introduction](/getting-started/introduction) -- what Kovar is designed for.
- [Full Audit](/api/audit) -- run all available checks.
- [SecurityFinding](/reference/types) -- the finding type reference.
