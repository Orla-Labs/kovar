# Changelog

## [0.2.1] - 2026-03-23

### Fixed
- Replace `waitForTimeout` with event-based dialog waiting in DOM XSS scanner
- Fix confidence=0 ambiguity in locator generator (use null for "use default")
- Fix reporter scorecard padding with dynamic `padLine()` helper
- Align `sanitizeResponseBody` patterns with codegen secret detection (api_key, private_key, client_secret, session_id, credential)
- Sanitize non-string JSON values (numbers, booleans, null) for sensitive keys

### Added
- `delayBetweenPayloads` option in `XSSCheckOptions` for WAF-protected targets
- `xss-no-forms` info finding when no forms are found (prevents silent false negatives)
- `TestGenerator` class extracted from RecordingSession (independently testable)
- `SelfHealer` class extracted from RecordingSession (independently testable)
- Integration test for full code generation pipeline (session → prompt → LLM → validate → write)
- Snapshot test for LLM prompt output (catches prompt regressions)
- Unit tests for retry exhaustion, extractPOMCode edge cases, credential detection, URL replacement

### Changed
- RecordingSession refactored into composition of TestGenerator + SelfHealer
- SelfHealer marked as `@internal` (not part of stable public API)

## [0.2.0] - 2026-03-22

### Added

#### AI-Powered Recorder
- AI-powered browser recording: `kovar record <url>`
- Page Object Model code generation (separate .page.ts + .spec.ts files)
- CLI with Anthropic and OpenAI LLM support (raw fetch, zero SDK dependencies)
- Action capture via browser-side injection (click, input, change, submit, keypress)
- SPA navigation monitoring (pushState, replaceState, popstate)
- Network capture (fetch/xhr with 10KB body limit, 500 request cap)
- Shadow DOM toolbar overlay with live counters, pause/resume, stop
- Locator generation with priority cascade (role > text > testid > placeholder > id > css)
- Auto-generated ID detection (React, Ember, Next.js, Radix, UUID patterns)
- Watchdog timer (5min idle timeout + 30min max recording duration, configurable)
- Graceful Ctrl+C handling (SIGINT closes browser cleanly)
- LLM fetch timeout (60s AbortController on both providers)
- LLM response validation (structure checks before accessing nested fields)
- .env file auto-loading in CLI
- .env.example generation with detected credential variables (BASE_URL, TEST_EMAIL, TEST_PASSWORD)
- PII masking in form values (password, email, phone, SSN/CPF/CNPJ/card patterns)

#### Codebase Awareness
- Codebase awareness: Vite plugin (`kovar/vite`), Next.js wrapper (`kovar/next`), Babel plugin (`kovar/babel`)
- Source-derived selectors with 0.97 confidence when `data-testid` found in source code
- AST parser with file caching for extracting component metadata (testId, ariaLabel, event handlers)
- `--source` CLI flag for source directory specification
- Page transition grouping by URL in LLM prompt (including hash-based routing for Vue/Angular SPAs)
- LocatorStrategy with confidence scoring (0.4-0.97), fallbacks, and concerns
- Dynamic content detection (strips numeric prefixes like "51 Needs Review" -> "Needs Review")
- `.first()` / `.nth()` fallbacks for non-unique elements
- ARIA context capture (aria-describedby, aria-expanded, aria-selected, disabled)
- Anti-patterns in LLM prompt (bans .or() chains, redundant assertions, hardcoded URLs)
- Few-shot POM example in system prompt
- Request deduplication in LLM prompt (collapses identical API calls with xN count)
- Smart network noise filtering (drops Cloudflare, analytics, tracking, static assets)
- URL post-processing (replaces hardcoded URLs with process.env.BASE_URL in generated code)
- Anti-bot detection bypass (navigator.webdriver override, Chrome user agent)

#### Self-Healing Loop
- `--heal` CLI flag to run generated tests and auto-fix failures via AI
- `--heal-attempts <n>` CLI flag for max self-healing attempts (default: 3)

#### XSS Payloads & Audit Extensibility
- 30 new XSS polyglot payloads across standard and thorough depth levels (40 total, up from 10)
  - Standard (15): encoding evasion, mixed case, null bytes, newline handlers, comment breakouts, quote-style variations, SVG animate, marquee, object/meta/video vectors
  - Thorough (15): unicode escapes, HTML/hex entity encoding, data URIs, base64, context breakouts (textarea, title, style, noscript), polyglot all-context payload
- Extensible audit system via `registerAuditCheck()` -- custom checks can register without modifying `audit()`
- `checks` option in `AuditOptions` for explicit check selection (e.g., `audit({ checks: ["headers", "cookies"] })`)
- `CheckFacade` exported from main entry for external use
- `isReflectedUnescaped()` exported from `@orlalabs/kovar/core` for standalone XSS detection logic
- Unit tests for `isReflectedUnescaped()` -- 13 test cases covering the full truth table
- Comprehensive README rewrite: security module guide, recorder guide, practical examples, CLI reference, confidence level tables

### Changed
- `validateSpecCode()` now requires `expect` in generated specs -- assertion-free tests are rejected
- `extractAndReplaceURLs()` now runs on page object code too, not just specs -- no hardcoded origins in `navigate()` methods
- `sanitizeTestName()` preserves dots and underscores (e.g., `my_test.flow` stays `my_test.flow` instead of `mytestflow`)
- API error handling in Anthropic/OpenAI providers now extracts structured error type/message only -- raw response bodies no longer leak into thrown errors

### Security
- PII masking: credit card numbers ([CARD]) and JWT tokens ([TOKEN]) in form values
- Expanded sensitive header masking (9 named headers + pattern matching for token/secret/key/auth/session)
- POST body sanitization (same filters as response body)
- Response body sanitization (JWT, email, sensitive JSON keys redacted)
- URL sanitization (query params stripped at capture time via safeUrl())
- Hardcoded credential detection in generated code (password, token, apiKey patterns + .fill() with long strings)
- Dangerous code pattern detection (13 patterns: eval, require, fs.promises, readFile, writeFile, import(), Function(), etc.)

### Fixed
- Hardcoded URLs could survive in page object `navigate()` methods when LLM ignored the system prompt
- Inline arrow handler detection (onClick={() => submit()} now extracted)
- Column matching precision (col=0 no longer wildcards to first element on line)
- `.js` endpoint filter (keeps /api/*.js, only drops .min.js/.bundle.js/chunk-*.js)
- isRelevantRequest() checks API/GraphQL URLs before noise patterns
- All cognitive complexity warnings resolved (functions refactored into helpers)

## [0.1.0] - 2026-03-21

### Added
- `toHaveSecureHeaders()` matcher -- 12 OWASP-aligned header rules with CSP quality validation
- `toHaveSecureCookies()` matcher -- 7 cookie security flag rules with session cookie detection
- `toBeResilientToXSS()` matcher -- XSS payloads with API-first injection and dialog detection
- `security` test fixture with `headers.assert()`, `cookies.assert()`, `audit()`
- Security reporter for Playwright with score summary
- Standalone `kovar/core` API for plain Playwright usage
- 60 unit + integration tests
