---
title: GitHub Action
description: Run Kovar security checks in CI and post findings as PR comments
---

Kovar ships a GitHub Action that runs header and cookie security checks against a URL and posts findings as PR comments.

It is a composite action: it installs `@orlalabs/kovar` and `@playwright/test` into a temporary directory and downloads Chromium itself, so your workflow does not need `npm ci` or `npx playwright install` for this step. Requires `@orlalabs/kovar` 0.7.0 or later. Pin the action to a release tag or commit SHA.

## Workflow Example

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
          node-version: 24

      - name: Run security check
        uses: Orla-Labs/kovar/.github/actions/security-check@v0.7.0
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
| `checks` | Comma-separated checks to run: `headers`, `cookies`. Any other value fails the step. | No | `headers,cookies` |
| `fail-on` | Minimum severity to fail: `critical`, `high`, `medium`, `low` | No | `high` |
| `comment` | Post findings as PR comment | No | `true` |
| `github-token` | GitHub token for PR comments | No | `${{ github.token }}` |
| `baseline-path` | Path to baseline JSON file for tracking findings across PRs | No | `""` (disabled) |
| `update-baseline` | Save current findings as new baseline | No | `false` |
| `output-dir` | Directory for `kovar-report.json` and `kovar.sarif` | No | `kovar-results` |
| `framework-package-json` | `package.json` used to pick framework-specific remediation in the JSON report | No | `package.json` |
| `kovar-package` | npm spec for Kovar (version, or path to a packed `.tgz`) | No | The version matching the action ref you pinned |
| `playwright-version` | `@playwright/test` version used to drive Chromium | No | `latest` |

## Action Outputs

| Output | Description |
|--------|-------------|
| `score` | Security score (0-100) |
| `findings-count` | Total number of findings |
| `blocking-count` | Findings that failed the gate |
| `passed` | Whether the check passed (`true`/`false`) |
| `json-path` | Path to `kovar-report.json` |
| `sarif-path` | Path to `kovar.sarif` (SARIF 2.1.0) |

## Pass/fail rules

- Without a baseline, any finding at or above `fail-on` fails the step.
- With a baseline (`baseline-path` pointing at an existing file), only findings that are **new** relative to the baseline fail the step. Existing findings are reported but do not block.
- A finding that says a check **could not run** (IDs ending in `-check-error` or `-check-skipped`, and `xss-no-forms`) always fails the step at or above `fail-on`, and is never written to a baseline. "Not verified" is not an accepted risk.

## Machine-readable output

Every run writes two files to `output-dir`:

- `kovar-report.json`: findings with `blocking`, `baseline` (`new`/`existing`/`none`) and `couldNotRun` flags, the gate result, resolved baseline entries, and framework-specific remediation suggestions.
- `kovar.sarif`: SARIF 2.1.0, one rule per finding ID, with `security-severity` and CWE tags.

The same Markdown as the PR comment is written to the job summary. The PR comment is updated in place on each run rather than posted again.

```yaml
      - name: Run security check
        id: security
        uses: Orla-Labs/kovar/.github/actions/security-check@v0.7.0
        with:
          url: "https://staging.your-app.com"

      - uses: actions/upload-artifact@v6
        if: always()
        with:
          name: kovar-results
          path: kovar-results/
```

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
          node-version: 24

      - name: Run security check with baseline
        uses: Orla-Labs/kovar/.github/actions/security-check@v0.7.0
        with:
          url: "https://staging.your-app.com"
          baseline-path: ".kovar/baseline.json"
          update-baseline: ${{ github.ref == 'refs/heads/main' }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

This saves the baseline on main branch merges and diffs against it on PRs. The runner is ephemeral: persist `.kovar/baseline.json` yourself, either by committing it or with `actions/cache` / `actions/upload-artifact` on main and a matching restore step on PRs. A baseline that does not exist yet means every finding is gated.

## Using Action Outputs

You can use the outputs in subsequent steps:

```yaml
      - name: Run security check
        id: security
        uses: Orla-Labs/kovar/.github/actions/security-check@v0.7.0
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
- [Full Audit](/api/audit/) -- the audit that powers the GitHub Action.
