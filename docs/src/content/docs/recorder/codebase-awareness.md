---
title: Codebase Awareness
description: Map UI elements to source components for higher-confidence locators
---

With the `--source` flag, Kovar maps UI elements back to their source components to generate higher-confidence selectors. Instead of guessing from the DOM alone, it reads your JSX to find `data-testid`, `aria-label`, and event handlers from the actual component definition.

```bash
kovar record https://your-app.com --source ./src
```

## Framework Setup

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

> `withKovar` disables SWC in dev mode to allow the Babel plugin to inject source attributes. This adds ~2-5 seconds to dev startup. Production builds are unaffected.

## How It Works

1. The build plugin injects `data-kovar-source` attributes into JSX elements at compile time (file path, component name, line number).
2. During recording, the recorder reads these attributes from the live DOM.
3. The AST parser extracts component metadata (testId, ariaLabel, event handlers) from source files.
4. The `LocatorStrategy` scores each selector candidate by confidence (0.4-0.97) and picks the best one.
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

The confidence jump from 0.40 (CSS) to 0.97 (source-verified testId) makes a significant difference in test stability. Use `--source` for React, Vue, and Svelte apps whenever possible.

## Related

- [CLI Reference](/recorder/cli) -- the `--source` flag and other options.
- [What Gets Generated](/recorder/output) -- how locators appear in generated code.
- [Self-Healing](/recorder/self-healing) -- auto-fix locator issues after recording.
