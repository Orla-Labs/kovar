---
title: Framework Support
description: Framework-specific remediation examples for Express, Fastify, Next.js, Koa, and Hono
---

Kovar generates framework-specific fix suggestions for security findings. Each framework has its own code patterns for setting headers, configuring cookies, and applying security middleware.

## Supported Frameworks

| Framework | Key | Typical fix location |
|-----------|-----|----------------------|
| Express | `"express"` | Middleware function |
| Fastify | `"fastify"` | Plugin or hook |
| Next.js | `"next"` | `next.config.js` headers or middleware |
| Koa | `"koa"` | Middleware function |
| Hono | `"hono"` | Middleware function |
| Generic | `"generic"` | Plain HTTP header setting |

## Express

```typescript
import { generateRemediation } from "@orlalabs/kovar/core";

const remediation = generateRemediation(findings, {
  framework: "express",
  language: "typescript",
});
```

Example output for a missing HSTS header:

```typescript
// suggestion.code
app.use((req, res, next) => {
	res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	next();
});
```

## Next.js

```typescript
const remediation = generateRemediation(findings, {
  framework: "next",
  language: "typescript",
});
```

Example output for a missing HSTS header:

```typescript
// suggestion.code
headers: async () => [{
	source: "/(.*)",
	headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
}]
```

## Fastify

```typescript
const remediation = generateRemediation(findings, {
  framework: "fastify",
  language: "typescript",
});
```

## Koa

```typescript
const remediation = generateRemediation(findings, {
  framework: "koa",
  language: "typescript",
});
```

## Hono

```typescript
const remediation = generateRemediation(findings, {
  framework: "hono",
  language: "typescript",
});
```

## Framework Detection

If you omit the `framework` option, it defaults to `"generic"`. To auto-detect based on your `package.json` dependencies, use the standalone `detectFramework()` utility:

```typescript
import { detectFramework, generateRemediation } from "@orlalabs/kovar/core";

const framework = detectFramework(); // reads package.json, returns best match
const remediation = generateRemediation(findings, { framework, language: "typescript" });
```

The detection priority order is:

1. Next.js
2. Hono
3. Fastify
4. Koa
5. Express
6. Generic (fallback)

## Related

- [Auto-Remediation](/remediation/overview) -- how remediation works and the `RemediationSuggestion` type.
- [Standalone API](/api/standalone) -- use `generateRemediation()` in scripts.
