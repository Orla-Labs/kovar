---
title: How It Works
description: Internal architecture of the Kovar recorder
---

This page describes the internal architecture of the Kovar recorder -- how it captures browser sessions and generates test code.

## Pipeline

1. **Launches Chromium** (headed) with Playwright's defaults. Kovar does not hide automation: `navigator.webdriver` is `true` and the user agent is unmodified, so sites with bot protection may challenge or block the recording session.

2. **Captures actions** in the browser via an injected script: clicks, inputs, selects, keypresses, and SPA navigations (pushState/replaceState). Actions are debounced (50ms for clicks, 300ms for inputs).

3. **Captures network** requests (fetch/xhr only). Filters out analytics, tracking, fonts, images, and static assets. Limits: 500 requests max, 10KB body per request.

4. **Masks credentials** before data is sent to the AI provider you configured (Anthropic or OpenAI): passwords, emails, credit cards, JWTs, phone numbers, and SSN-like patterns are replaced with tokens like `[PASSWORD]`, `[EMAIL]`, `[TOKEN]`. Network bodies are sanitized (JWTs, emails, Bearer/Basic credentials, and values of token/secret/password-like keys in JSON and form bodies). Query strings and hash parameters are stripped from every URL. Masking is pattern-based and best effort: page text, element labels, request paths and the first 200 characters of API request/response bodies are sent to the provider, so record against test accounts and non-production data.

5. **Sends to AI** with a structured prompt: actions grouped by page, suggested locator strategies, API calls prioritized by mutation type. Dynamic token budgeting keeps costs low (~$0.05-0.15/session on Claude Sonnet).

6. **Validates output** (defense in depth, not a sandbox): rejects generated code that imports anything other than `@playwright/test` and local page objects, reads environment variables other than `BASE_URL` / `TEST_*`, uses `eval()`, `require()`, file-path options, `page.request`, `setInputFiles`, hardcoded secrets, or lacks assertions. Review generated tests before committing them.

7. **Writes files**: page objects, spec, and `.env.example`. If AI generation fails, saves the raw recording as JSON for manual use or retry.

## Session Limits

| Limit | Value |
|-------|-------|
| Max actions | 200 (configurable) |
| Max duration | 30 minutes |
| Inactivity timeout | 5 minutes |
| Max network requests | 500 |
| Max body size per request | 10KB |

## Action Capture

Actions are captured in the browser via an injected IIFE script. The script intercepts:

- Click events (debounced at 50ms)
- Input/change events (debounced at 300ms)
- Select change events
- Keypress events (Enter, Tab, Escape)
- SPA navigations (pushState, replaceState)

Each action is recorded with element metadata: tag name, text content, attributes (id, class, role, aria-label, data-testid, name, placeholder, type, href), and computed accessibility properties.

## Network Capture

Only fetch and XHR requests are captured. The following are filtered out:

- Analytics and tracking requests
- Font requests
- Image requests
- Static asset requests (CSS, JS bundles)

Request and response bodies are redacted, then truncated to 10KB. Sensitive data in bodies (JWTs, emails, API keys, values of token/secret/password-like keys) is redacted before being sent to the AI.

## Code Generation

The AI receives a structured prompt containing:

- Actions grouped by page (URL).
- Suggested locator strategies for each element (ranked by confidence).
- Network requests prioritized by mutation type (POST/PUT/DELETE first).
- Environment variable placeholders for detected credentials.

The generated code is validated for:

- No `eval()`, `require()`, `child_process`, or `fs` operations.
- No hardcoded secrets (passwords, API keys, tokens).
- The spec mentions `expect`, `test(` and `page` (a text check; it does not verify that each test has an assertion, and TypeScript syntax is not parsed).

## Fallback

If AI generation fails (network error, validation failure, malformed output), the recorder saves the raw recording as JSON in `<output>/<name>.recording.json`, next to your tests. (Before 0.7.0 it was written as `<name>.recording.spec.ts`, which Playwright tried to load as a test.) It is never passed to `--heal`. You can use this data to:

- Retry generation with a different model.
- Manually write tests using the captured actions and locator metadata.

## Related

- [Recorder Getting Started](/recorder/getting-started) -- how to start a recording session.
- [CLI Reference](/recorder/cli) -- all command-line options.
- [Codebase Awareness](/recorder/codebase-awareness) -- how source mapping improves locators.
