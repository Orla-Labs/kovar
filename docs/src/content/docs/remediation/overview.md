---
title: Auto-Remediation
description: Generate framework-specific fix suggestions from security findings
---

Kovar can generate framework-specific code fixes for security findings. Given a list of findings and a target framework, it produces copy-pasteable code suggestions.

## Basic Usage

```typescript
import { generateRemediation } from "@orlalabs/kovar/core";

const remediation = generateRemediation(findings, {
  framework: "express",     // "express" | "fastify" | "next" | "koa" | "hono" | "generic"
  language: "typescript",   // "typescript" | "javascript"
});

for (const suggestion of remediation.suggestions) {
  console.log(`Finding: ${suggestion.findingId}`);
  console.log(`File: ${suggestion.filePath}`);
  console.log(`Fix:\n${suggestion.code}`);
}
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `framework` | `string` | Target framework (see [Framework Support](/remediation/frameworks)) |
| `language` | `"typescript" \| "javascript"` | Output language |

## RemediationSuggestion

Each suggestion includes:

```typescript
interface RemediationSuggestion {
  findingId: string;                        // e.g. "header-missing-hsts"
  framework: Framework;                     // detected or specified framework
  description: string;                      // human-readable explanation
  code: string;                             // copy-pasteable fix
  filePath?: string;                        // suggested file (e.g. "middleware.ts", "next.config.js")
  language: "typescript" | "javascript";
  confidence: "high" | "medium" | "low";
  references: string[];                     // links to docs
}
```

## RemediationReport

The full report structure:

```typescript
interface RemediationReport {
  findings: number;                         // total findings processed
  suggestions: RemediationSuggestion[];     // actionable suggestions
  unsupported: string[];                    // finding IDs without auto-remediation
}
```

## Framework Default

If you omit the `framework` option, it defaults to `"generic"`. If you want auto-detection based on your `package.json` dependencies, you can use the standalone `detectFramework()` utility and pass the result:

```typescript
import { detectFramework, generateRemediation } from "@orlalabs/kovar/core";

const framework = detectFramework(); // reads package.json, returns best match
const remediation = generateRemediation(findings, { framework, language: "typescript" });
```

## Related

- [Framework Support](/remediation/frameworks) -- framework-specific examples.
- [Standalone API](/api/standalone) -- use `generateRemediation()` in scripts.
- [SecurityFinding](/reference/types) -- the finding type that remediation processes.
