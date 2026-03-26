---
title: Self-Healing
description: Auto-fix generated test failures with AI-powered self-healing
---

When you pass `--heal`, Kovar runs the generated test immediately after recording. If the test fails, it sends the failure output back to the AI, which rewrites the test code to fix the issue. This loop repeats up to `--heal-attempts` times (default: 3).

## Usage

```bash
kovar record https://your-app.com --heal
```

Allow up to 5 healing attempts:

```bash
kovar record https://your-app.com --heal --heal-attempts 5
```

## What It Fixes

Typical fixes the self-healing loop catches:

- Incorrect or flaky locators (element not found, wrong role name)
- Missing `await` or missing waits for navigation/network idle
- Assertion mismatches (wrong expected text or URL pattern)

## How It Works

1. After recording, Kovar generates test files as usual.
2. It runs the generated test with `npx playwright test`.
3. If the test fails, the failure output (error message, stack trace) is sent back to the AI.
4. The AI rewrites the failing code to fix the issue.
5. Steps 2-4 repeat until the test passes or the max attempts are reached.

## Cost

Each healing attempt makes an additional LLM call, so costs scale with the number of retries. A typical session with 1-2 healing attempts costs ~$0.10-0.30 total (including the initial generation).

## When Healing Fails

If the test still fails after all attempts, Kovar prints the last error and exits. You can:

- Review the error output and fix manually.
- Run `--heal` again with a higher `--heal-attempts` value.
- Check [Codebase Awareness](/recorder/codebase-awareness) to improve locator confidence.

## Related

- [CLI Reference](/recorder/cli) -- all command-line options including `--heal`.
- [What Gets Generated](/recorder/output) -- output file format.
- [Codebase Awareness](/recorder/codebase-awareness) -- improve locator reliability.
