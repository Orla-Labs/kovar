---
description: Start a Kovar recording session to generate Playwright tests
---

Help the user set up and run a Kovar recording session.

1. Check if kovar is installed: `npm ls @orlalabs/kovar`
2. Check if ANTHROPIC_API_KEY or OPENAI_API_KEY is set in .env
3. Ask the user for the URL to record
4. Run: `npx kovar record <url>`
5. After recording completes, review the generated files:
   - Check the page object file in `pages/`
   - Check the spec file
   - Suggest improvements to selectors or assertions
