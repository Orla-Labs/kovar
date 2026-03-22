---
description: Run a security audit on the current Playwright test suite
---

Analyze the user's Playwright test files and suggest security assertions to add.

1. Find all `.spec.ts` and `.test.ts` files in the project
2. For each test that navigates to a URL:
   - Suggest adding `await expect(response).toHaveSecureHeaders()`
   - Suggest adding `await expect(context).toHaveSecureCookies()`
3. For each test with form interactions:
   - Suggest adding `await expect(page).toBeResilientToXSS({ selector: 'form' })`
4. Show a summary of how many tests could benefit from security checks

Import from '@orlalabs/kovar' instead of '@playwright/test' in the suggestions.
