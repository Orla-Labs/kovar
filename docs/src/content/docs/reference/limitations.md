---
title: What Kovar Does Not Catch
description: Known gaps, what Kovar does catch, and recommended complements
---

Kovar is a **security regression testing** tool, not a comprehensive security scanner. It catches common misconfigurations and stops them from coming back. It does not replace professional security testing. Read this page before you rely on a green run.

## Known Gaps in the Checks

These are confirmed by Kovar's public detection-accuracy suite (`npm run test:accuracy`), which keeps each unfixed gap visible as an expected failure:

- **XSS:** DOM-based and SPA XSS, where client-side JavaScript sends the input to an API and writes the result into the page.
- **XSS:** stored XSS, where the payload is saved and rendered on a different page or a later request.
- **XSS:** filter-bypass XSS, for example a blocklist that strips `alert` but leaves `<img onerror=...>` markup intact (both API and DOM mode).
- **XSS:** in DOM mode, markup injection that a CSP blocks from executing.
- **XSS:** inputs that are not inside a `<form>` (typical SPA search boxes), and forms inside iframes or Shadow DOM.

Other known limits:

- **Headers:** a CSP delivered by `<meta http-equiv>` is not read, so a static host that only uses meta CSP is reported as missing CSP.
- **CSRF:** `PUT`/`DELETE`/`PATCH` are probed by default even though a cross-site page cannot send them without a CORS preflight, so a `2xx` there can be a false positive. Pass `methods: ["POST"]` if that applies. Bearer-token APIs are not detected as such.
- **CORS:** `Access-Control-Allow-Origin: *` without credentials is rated high, which is noisy for public APIs and CDNs.
- **Cookies:** session cookies are recognised by name. Add yours with `sessionCookiePatterns` if it is not matched.
- **Browsers:** checks are tested on Chromium only.

## Checks That Could Not Run Fail

When a check cannot verify anything (unreachable host, no form, not logged in, page closed), Kovar reports a **high** finding such as `csrf-check-unauthenticated`, `xss-no-forms` or `auth-check-error`. It never reports a pass for a check that did not run. See [Full Audit](/api/audit#checks-that-could-not-run) for the full list.

## Out of Scope

- Blind injection vulnerabilities (time-based, out-of-band)
- Open redirects
- Authorization/privilege escalation
- Server-side vulnerabilities (SSRF, SSTI, deserialization)
- Dependency vulnerabilities
- Business logic flaws
- TLS/SSL configuration
- Compliance mapping (OWASP ASVS / PCI-DSS was removed in 0.7.0)

## What It Catches

- Missing or misconfigured HTTP security headers (12 OWASP-aligned checks)
- Weak cookie security flags (Secure, HttpOnly, SameSite, prefix validation)
- Overly permissive CSP (wildcards, `'unsafe-inline'` without nonces or hashes, `'unsafe-eval'`, scheme sources)
- Reflected XSS: Detects server-side reflected XSS in HTML forms; not DOM/SPA, stored, or filter-bypass XSS.
- CSRF gaps on cookie-session endpoints (missing token and no Origin/Fetch-Metadata check), with a logged-in request context
- CORS misconfigurations (origin reflection, bypassable allowlists, wildcard origins, permissive headers/methods)
- Missing authentication on protected endpoints (with info-leak detection on error responses)

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
