---
title: Baseline Tracking
description: Track security baselines and diff findings across PRs
---

Baseline tracking compares current security findings against a saved baseline, so you can distinguish new regressions from known issues and track improvements over time.

## How It Works

1. Run security checks and save the findings as a baseline JSON file.
2. On subsequent runs, load the baseline and diff against current findings.
3. New findings are flagged as regressions; resolved findings are flagged as improvements; existing findings are shown but don't block.

## Baseline API

The baseline functions are exported from `src/ci/baseline.ts`:

```typescript
import {
  loadBaseline,
  saveBaseline,
  diffFindings,
  createBaseline,
} from "@orlalabs/kovar/ci/baseline";
```

### `loadBaseline(filePath)`

Reads a baseline JSON file from disk. Returns `null` if the file doesn't exist or is invalid.

```typescript
const baseline = loadBaseline(".kovar/baseline.json");
// Returns BaselineFile | null
```

### `saveBaseline(findings, filePath)`

Saves current findings as a baseline file. Creates parent directories if needed.

```typescript
saveBaseline(report.findings, ".kovar/baseline.json");
```

### `diffFindings(currentFindings, baseline)`

Compares current findings against a baseline. Note: current findings is the **first** argument, baseline is the **second**.

```typescript
const diff = diffFindings(currentFindings, baseline);

console.log(`New findings: ${diff.new.length}`);       // regressions
console.log(`Existing: ${diff.existing.length}`);       // already known
console.log(`Resolved: ${diff.resolved.length}`);       // fixed since baseline
```

Returns a `BaselineDiff`:

```typescript
interface BaselineDiff {
  new: SecurityFinding[];      // findings not in baseline (regressions)
  existing: SecurityFinding[]; // findings already in baseline
  resolved: BaselineEntry[];   // baseline entries no longer found (improvements)
}
```

If `baseline` is `null` (no baseline file), all current findings are treated as new.

### `createBaseline(findings)`

Creates a `BaselineFile` object from findings without writing to disk.

```typescript
interface BaselineFile {
  version: 1;
  timestamp: string;           // ISO 8601
  entries: BaselineEntry[];
}

interface BaselineEntry {
  id: string;                  // finding ID (e.g., "header-missing-hsts")
  severity: Severity;
  url: string;
  firstSeen: string;           // ISO 8601 timestamp
}
```

## Usage with GitHub Action

The simplest way to use baseline tracking is via the [GitHub Action](/ci/github-action/):

```yaml
- name: Run security check with baseline
  uses: ./.github/actions/security-check
  with:
    url: "https://staging.your-app.com"
    baseline-path: ".kovar/baseline.json"
    update-baseline: ${{ github.ref == 'refs/heads/main' }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

This:
- Loads the baseline from `.kovar/baseline.json` (if it exists)
- Diffs current findings against the baseline
- Posts a PR comment with new/existing/resolved sections
- Updates the baseline file on main branch merges

## PR Comment with Baseline

When baseline tracking is active, the PR comment shows three sections:

**New Findings** -- findings not in the baseline. These are regressions introduced by the PR.

**Existing Findings** -- findings already present in the baseline. These pre-date the PR.

**Resolved** -- baseline entries that no longer appear. These were fixed by the PR, shown with strikethrough formatting.

## Manual Usage

For scripts or custom CI pipelines:

```typescript
import { analyzeHeaders } from "@orlalabs/kovar/core";
import { loadBaseline, saveBaseline, diffFindings } from "@orlalabs/kovar/ci/baseline";

// Get current findings
const findings = analyzeHeaders(responseHeaders);

// Load baseline
const baseline = loadBaseline(".kovar/baseline.json");

// Diff
const diff = diffFindings(findings, baseline);

if (diff.new.length > 0) {
  console.error(`${diff.new.length} new security regressions!`);
  process.exit(1);
}

// Optionally update baseline
saveBaseline(findings, ".kovar/baseline.json");
```

## Related

- [GitHub Action](/ci/github-action/) -- run security checks with baseline tracking in CI.
- [Reporter](/ci/reporter/) -- Playwright reporter with score cards.
- [Full Audit](/api/audit/) -- generate findings for baseline tracking.
