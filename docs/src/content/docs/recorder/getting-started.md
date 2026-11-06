---
title: Recorder Getting Started
description: Record browser sessions and generate Page Object Model tests with AI
---

The Kovar recorder opens a Chromium browser, captures your interactions, and uses AI to generate Page Object Model tests with resilient locators and environment-driven credentials.

## Prerequisites

Set an API key in your `.env` file:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...
```

The recorder auto-detects the provider from whichever API key is available. You can also specify a provider explicitly with `--provider`.

## Record a Session

```bash
npx kovar record https://your-app.com
```

A Chromium browser opens with a recording toolbar at the top. Browse your app -- click buttons, fill forms, navigate pages. The toolbar shows action and API call counts in real time.

## Stop and Generate

Click **Stop** when you're done. Kovar sends the captured session to the AI, which generates:

```
tests/
  pages/
    login-dashboard.page.ts  # Page object classes (one class per page, all in one file)
  login-dashboard.spec.ts    # Test spec
  .env.example               # Credential template (only if credentials were detected)
```

## Run the Generated Test

Fill in `.env.example` with real test credentials, rename to `.env`, and run:

```bash
npx playwright test login-dashboard.spec.ts
```

## Tips

- **Log in first** -- if your app requires authentication, the recording captures the login flow and extracts credentials into `process.env.*` variables.
- **Use `--name`** for meaningful file names. Without it, the name is derived from the URL path (e.g., `/checkout/payment` -> `checkout-payment.spec.ts`).
- **Use `--source`** for React apps (JSX/TSX only; point it at the project root and install the Babel packages first). The confidence jump from 0.4 (CSS) to 0.97 (source-verified testId) makes a real difference in test stability. See [Codebase Awareness](/recorder/codebase-awareness).
- **Review generated code** before committing. The AI is good but not perfect -- you may want to adjust assertions or add waits.
- **If AI generation fails**, Kovar writes the raw session as JSON to `<output>/<name>.recording.spec.ts` (sanitized but rich with URLs, element text, and form field names). It is not a valid test; Playwright will try to load it. Delete it or add `*.recording.spec.ts` to `.gitignore` and to `testIgnore` in your Playwright config.

## Next Steps

- See [What Gets Generated](/recorder/output) for detailed examples of the output.
- See [CLI Reference](/recorder/cli) for all available options.
- See [Self-Healing](/recorder/self-healing) to auto-fix test failures after recording.
