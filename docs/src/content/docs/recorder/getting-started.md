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
    login.page.ts          # Page object class
    dashboard.page.ts      # One per page visited
  login-dashboard.spec.ts  # Test spec
  .env.example             # Credential template
```

## Run the Generated Test

Fill in `.env.example` with real test credentials, rename to `.env`, and run:

```bash
npx playwright test login-dashboard.spec.ts
```

## Tips

- **Log in first** -- if your app requires authentication, the recording captures the login flow and extracts credentials into `process.env.*` variables.
- **Use `--name`** for meaningful file names. Without it, the name is derived from the URL path (e.g., `/checkout/payment` -> `checkout-payment.spec.ts`).
- **Use `--source`** for React/Vue/Svelte apps. The confidence jump from 0.4 (CSS) to 0.97 (source-verified testId) makes a real difference in test stability. See [Codebase Awareness](/recorder/codebase-awareness).
- **Review generated code** before committing. The AI is good but not perfect -- you may want to adjust assertions or add waits.
- **Add `.recording` to `.gitignore`** -- if AI generation fails, the fallback JSON file contains session data (sanitized but rich with URLs, element text, and form field names).

## Next Steps

- See [What Gets Generated](/recorder/output) for detailed examples of the output.
- See [CLI Reference](/recorder/cli) for all available options.
- See [Self-Healing](/recorder/self-healing) to auto-fix test failures after recording.
