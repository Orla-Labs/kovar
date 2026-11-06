---
title: GitHub Action
description: Run Kovar security checks in CI and post findings as PR comments
---

:::danger[Not usable in 0.6.0]
The action described on this page does not work for external repositories yet:

- `uses: ./.github/actions/security-check` refers to a path inside **your** repository, which does not exist there. The action lives in the Kovar repository.
- The action runs `dist/ci/index.js`, which is not built or published in 0.6.0, so referencing it from the Kovar repository fails too.
- The `checks` input only supports `headers` and `cookies`; other values are silently ignored.
- With `baseline-path`, existing findings are labelled in the comment but **still fail** the job if they meet `fail-on`.

Until this is fixed, the reliable CI path is to run your Kovar Playwright tests with `npx playwright test` in your normal workflow (see [Running Kovar tests in CI](#running-kovar-tests-in-ci) below).
:::

The planned GitHub Action loads a single URL in Chromium, checks its headers and cookies, and posts findings as a PR comment. It does not run your Playwright suite.

## Running Kovar Tests in CI

Kovar tests are ordinary Playwright tests, so the CI setup is the same as for any Playwright suite:

```yaml
# .github/workflows/e2e.yml
name: E2E
on: [pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
```

A failing security matcher fails the job like any other assertion. Add the [Reporter](/ci/reporter) for a score card in the log.

## Planned Action: Workflow Example

```yaml
# .github/workflows/security.yml
name: Security Check
on: [pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install chromium

      - name: Run security check
        uses: ./.github/actions/security-check
        with:
          url: "https://staging.your-app.com"
          checks: "headers,cookies"
          fail-on: "high"
          comment: "true"
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `url` | URL to check | Yes | -- |
| `checks` | Comma-separated checks to run | No | `headers,cookies` |
| `fail-on` | Minimum severity to fail: `critical`, `high`, `medium`, `low` | No | `high` |
| `comment` | Post findings as PR comment | No | `true` |
| `github-token` | GitHub token for PR comments | No | `${{ github.token }}` |
| `baseline-path` | Path to baseline JSON file for tracking findings across PRs | No | `""` (disabled) |
| `update-baseline` | Save current findings as new baseline | No | `false` |

## Action Outputs

| Output | Description |
|--------|-------------|
| `score` | Security score (0-100) |
| `findings-count` | Total number of findings |
| `passed` | Whether the check passed (`true`/`false`) |

## PR Comment Format

When `comment` is enabled, Kovar posts a structured comment on the PR with:

- Security score (0-100)
- Pass/fail status based on the severity threshold
- Summary table of findings by severity
- Expandable details for each finding with CWE references and remediation guidance

When [baseline tracking](/ci/baseline/) is enabled, the comment additionally shows:

- **New Findings** -- findings not in the baseline (regressions)
- **Existing Findings** -- findings already known from the baseline
- **Resolved** -- baseline findings no longer present (improvements)

## Baseline Tracking in CI

To track findings across PRs, save a baseline on main and diff against it on PRs:

```yaml
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install chromium

      - name: Run security check with baseline
        uses: ./.github/actions/security-check
        with:
          url: "https://staging.your-app.com"
          baseline-path: ".kovar/baseline.json"
          update-baseline: ${{ github.ref == 'refs/heads/main' }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

This saves the baseline on main branch merges and diffs against it on PRs.

## Using Action Outputs

You can use the outputs in subsequent steps:

```yaml
      - name: Run security check
        id: security
        uses: ./.github/actions/security-check
        with:
          url: "https://staging.your-app.com"

      - name: Check results
        run: |
          echo "Score: ${{ steps.security.outputs.score }}"
          echo "Findings: ${{ steps.security.outputs.findings-count }}"
          echo "Passed: ${{ steps.security.outputs.passed }}"
```

## Related

- [Baseline Tracking](/ci/baseline/) -- track security baselines across PRs.
- [Reporter](/ci/reporter/) -- Playwright reporter for local and CI test runs.
- [Full Audit](/api/audit/) -- the in-test audit (the action uses its own headers/cookies scan, not `security.audit()`).
