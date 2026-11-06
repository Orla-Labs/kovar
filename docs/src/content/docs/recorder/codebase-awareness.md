---
title: Codebase Awareness
description: Map UI elements to source components for higher-confidence locators
---

With the `--source` flag, Kovar maps UI elements back to their source components to generate higher-confidence selectors. Instead of guessing from the DOM alone, it reads your JSX to find `data-testid`, `aria-label`, and event handlers from the actual component definition.

```bash
kovar record https://your-app.com --source .
```

Point `--source` at the **project root** (the directory your dev server runs from), not at `./src`: the injected file paths are relative to the dev server's working directory (e.g. `src/components/Button.tsx`), and `--source ./src` would look for `src/src/...` and silently fall back to DOM-only locators.

:::caution[Extra install step in 0.6.0]
The Vite/Babel plugins and `--source` parsing need Babel packages that are not installed with `@orlalabs/kovar` in 0.6.0. Without them you get `Cannot find package '@babel/generator'` (plugins) or a "Failed to parse source location" warning per action (recorder). Install them yourself:

```bash
npm install -D @babel/parser @babel/traverse @babel/generator @babel/types
```
:::

Only React JSX/TSX (`.jsx`/`.tsx`) is supported. Vue single-file components and Svelte are not transformed.

## Framework Setup

The source plugins and `kovar record --source` parse your code with Babel, which is an optional peer dependency. Install it next to Kovar (Babel 7 or 8):

```bash
npm install -D @babel/parser @babel/traverse @babel/generator @babel/types
```

### Vite

```typescript
// vite.config.ts
import { kovarSourcePlugin } from "@orlalabs/kovar/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [kovarSourcePlugin()],
});
```

### Next.js

```javascript
// next.config.js
const { withKovar } = require("@orlalabs/kovar/next");

module.exports = withKovar({
  // your existing config
});
```

Then create a `.babelrc` in your project root:

```json
{
  "presets": ["next/babel"],
  "plugins": ["@orlalabs/kovar/babel"]
}
```

> Adding a `.babelrc` is what switches Next.js from SWC to Babel, and it does so for **all** builds, including production (the Kovar Babel plugin itself is a no-op in production, but the build still runs through Babel). Expect slower dev startup and builds; consider adding the `.babelrc` only in the environment where you record. `withKovar` only sets `experimental.forceSwcTransforms: false`.

## How It Works

1. The build plugin injects `data-kovar-file`, `data-kovar-line` and `data-kovar-col` attributes into JSX elements at compile time.
2. During recording, the recorder reads these attributes from the live DOM.
3. The AST parser extracts component metadata (testId, ariaLabel, event handlers) from source files.
4. The `LocatorStrategy` ranks selector candidates in a fixed priority order with a confidence value (0.4-0.97); the AI makes the final choice when generating code.
5. Generated tests use standard Playwright locators -- no `data-kovar-*` attributes leak into test output.

## Confidence Levels

| Source | Confidence | Example |
|--------|------------|---------|
| Source-verified testId | 0.97 | `page.getByTestId("submit-btn")` |
| Source-verified role + aria-label | 0.95 | `page.getByRole("button", { name: "Submit" })` |
| DOM testId | 0.95 | `page.getByTestId("submit-btn")` |
| DOM role + aria-label | 0.90 | `page.getByRole("button", { name: "Submit" })` |
| Short visible text | 0.70 | `page.getByText("Submit")` |
| CSS selector fallback | 0.40 | `page.locator(".btn-primary")` |

The confidence jump from 0.40 (CSS) to 0.97 (source-verified testId) makes a significant difference in test stability. Use `--source` for React apps whenever possible.

## Related

- [CLI Reference](/recorder/cli) -- the `--source` flag and other options.
- [What Gets Generated](/recorder/output) -- how locators appear in generated code.
- [Self-Healing](/recorder/self-healing) -- auto-fix locator issues after recording.
