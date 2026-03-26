---
title: Reporter
description: Playwright reporter for aggregated security findings and score cards
---

The Kovar reporter is a Playwright reporter that aggregates all security findings from tests using the `security` fixture and prints a score card.

## Setup

Add the reporter to your Playwright config:

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["list"], ["@orlalabs/kovar/reporter"]],
});
```

## Score Card Output

After each test run, the reporter prints a summary:

```
+----- Kovar Security Summary --------------------------+
|                                                        |
|  Score: 60/100                                         |
|                                                        |
|  x 2 critical                                          |
|  x 1 high                                              |
|  ! 3 medium                                            |
|                                                        |
|  4 test(s) with security findings                      |
|                                                        |
+--------------------------------------------------------+
```

## Scoring

The score starts at 100 and is reduced based on finding severity:

| Severity | Score Penalty |
|----------|---------------|
| Critical | -20 per finding |
| High | -10 per finding |
| Medium | -5 per finding |
| Low | -2 per finding |

Info-level findings do not affect the score.

## How It Works

The reporter collects findings from:

1. Tests that use the [security fixture](/api/fixture) (`.assert()` or `.check()` calls).
2. Tests that run a [full audit](/api/audit) via `security.audit()`.

All findings are automatically attached as JSON to the Playwright test report. The Kovar reporter reads these attachments and aggregates them across the entire test suite.

## Related

- [Security Fixture](/api/fixture) -- the fixture that generates findings for the reporter.
- [Full Audit](/api/audit) -- run all checks and feed results to the reporter.
- [GitHub Action](/ci/github-action) -- run the reporter in CI.
- [Baseline Tracking](/ci/baseline) -- track score changes over time.
