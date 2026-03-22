---
description: Convert flat Playwright tests to Page Object Model pattern
---

Convert the user's Playwright test files from flat test scripts to Page Object Model (POM) structure.

For each test file:

1. **Identify pages** — Group actions by URL/navigation events
2. **Extract page objects** — Create a `*.page.ts` file with:
   - Locators as getter properties
   - User actions as async methods
   - navigate() method using process.env.BASE_URL
3. **Rewrite spec** — Import page objects, use methods instead of raw locators
4. **Handle credentials** — Replace hardcoded values with process.env references
5. **Generate .env.example** — List required environment variables

Output structure:
```
pages/
  login.page.ts
  dashboard.page.ts
tests/
  flow-name.spec.ts
.env.example
```
