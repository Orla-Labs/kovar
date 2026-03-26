---
title: What Gets Generated
description: Page objects, test specs, and environment templates produced by the recorder
---

The Kovar recorder generates three types of files: page objects, test specs, and environment templates. Each file follows Playwright best practices.

## Page Object

A page object class is generated for each page visited during the recording session.

**Example** (`tests/pages/login.page.ts`):

```typescript
import type { Page } from "@playwright/test";

export class LoginPage {
  constructor(private page: Page) {}

  private get emailInput() {
    return this.page.getByRole("textbox", { name: "Email" });
  }
  private get passwordInput() {
    return this.page.getByRole("textbox", { name: "Password" });
  }
  private get submitButton() {
    return this.page.getByRole("button", { name: "Sign In" });
  }

  async navigate() {
    await this.page.goto(`${process.env.BASE_URL}/login`);
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

## Test Spec

A test spec ties page objects together into a test scenario.

**Example** (`tests/login-dashboard.spec.ts`):

```typescript
import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/login.page";

const BASE_URL = process.env.BASE_URL ?? "";
const EMAIL = process.env.TEST_EMAIL ?? "";
const PASSWORD = process.env.TEST_PASSWORD ?? "";

test("user logs in and views dashboard", async ({ page }) => {
  const loginPage = new LoginPage(page);

  // Intent: Navigate and authenticate
  await loginPage.navigate();
  await loginPage.login(EMAIL, PASSWORD);

  // Intent: Verify successful login
  await expect(page).toHaveURL(/dashboard/);
});
```

## Environment Template

A `.env.example` file lists all environment variables the tests need.

**Example** (`tests/.env.example`):

```bash
# Test credentials -- copy to .env and fill in real values
BASE_URL=https://your-app.com
TEST_EMAIL=your-email@example.com
TEST_PASSWORD=your-password
```

## Key Qualities

- **No hardcoded URLs** -- the app origin is replaced with `process.env.BASE_URL`.
- **No hardcoded credentials** -- passwords, emails, and tokens use `process.env.*` variables.
- **Resilient locators** -- prefers `getByRole` > `getByText` > `getByTestId` > `getByPlaceholder` > CSS selectors.
- **One page object per page** -- class names inferred from URL paths (`/login` -> `LoginPage`, `/dashboard` -> `DashboardPage`).
- **Intent comments** -- `// Intent:` comments group logical action sequences in the spec.

## Credential Masking

Before anything is sent to the AI, the recorder masks:

- Passwords
- Email addresses
- Credit card numbers
- JWTs
- Phone numbers
- SSN-like patterns

These are replaced with tokens like `[PASSWORD]`, `[EMAIL]`, `[TOKEN]`. Network responses are also sanitized (JWTs, emails, sensitive JSON keys redacted).

## Related

- [Recorder Getting Started](/recorder/getting-started) -- how to start a recording session.
- [CLI Reference](/recorder/cli) -- all command-line options.
- [Codebase Awareness](/recorder/codebase-awareness) -- improve locator confidence with source mapping.
