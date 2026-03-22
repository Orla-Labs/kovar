---
description: Review and fix brittle selectors in Playwright tests
---

Analyze the user's Playwright test files for brittle selectors and suggest improvements.

Review all test files for:

1. **CSS selectors** (`page.locator('.class')`, `page.locator('#id')`) — suggest replacing with:
   - `page.getByRole()` with accessible name
   - `page.getByTestId()` if data-testid exists
   - `page.getByText()` for unique visible text
   - `page.getByPlaceholder()` for inputs

2. **Dynamic content in selectors** — text containing numbers, dates, or counts that change between runs. Suggest using partial text or regex.

3. **Non-unique selectors** — selectors that might match multiple elements. Suggest adding `.nth()`, `.first()`, or parent context chaining.

4. **Hardcoded URLs** — suggest using `process.env.BASE_URL`

5. **Hardcoded credentials** — suggest using `process.env.TEST_EMAIL`, `process.env.TEST_PASSWORD`

Show before/after for each suggestion.
