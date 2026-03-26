---
title: How It Works
description: Internal architecture of the Kovar recorder
---

This page describes the internal architecture of the Kovar recorder -- how it captures browser sessions and generates test code.

## Pipeline

1. **Launches Chromium** with anti-bot detection bypass (`navigator.webdriver` override, standard Chrome user agent). Works on Cloudflare-protected sites.

2. **Captures actions** in the browser via an injected script: clicks, inputs, selects, keypresses, and SPA navigations (pushState/replaceState). Actions are debounced (50ms for clicks, 300ms for inputs).

3. **Captures network** requests (fetch/xhr only). Filters out analytics, tracking, fonts, images, and static assets. Limits: 500 requests max, 10KB body per request.

4. **Masks credentials** before anything is sent to the AI: passwords, emails, credit cards, JWTs, phone numbers, and SSN-like patterns are all replaced with tokens like `[PASSWORD]`, `[EMAIL]`, `[TOKEN]`. Network responses are also sanitized (JWTs, emails, sensitive JSON keys redacted).

5. **Sends to AI** with a structured prompt: actions grouped by page, suggested locator strategies, API calls prioritized by mutation type. Dynamic token budgeting keeps costs low (~$0.05-0.15/session on Claude Sonnet).

6. **Validates output**: rejects generated code containing `eval()`, `require()`, `child_process`, `fs` operations, hardcoded secrets, or missing assertions.

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

Request and response bodies are truncated to 10KB. Sensitive data in bodies (JWTs, emails, API keys in JSON values) is redacted before being sent to the AI.

## Code Generation

The AI receives a structured prompt containing:

- Actions grouped by page (URL).
- Suggested locator strategies for each element (ranked by confidence).
- Network requests prioritized by mutation type (POST/PUT/DELETE first).
- Environment variable placeholders for detected credentials.

The generated code is validated for:

- No `eval()`, `require()`, `child_process`, or `fs` operations.
- No hardcoded secrets (passwords, API keys, tokens).
- At least one assertion per test.
- Valid TypeScript syntax.

## Fallback

If AI generation fails (network error, validation failure, malformed output), the recorder saves the raw recording as a JSON file in a `.recording` directory. You can use this data to:

- Retry generation with a different model.
- Manually write tests using the captured actions and locator metadata.

## Related

- [Recorder Getting Started](/recorder/getting-started) -- how to start a recording session.
- [CLI Reference](/recorder/cli) -- all command-line options.
- [Codebase Awareness](/recorder/codebase-awareness) -- how source mapping improves locators.
