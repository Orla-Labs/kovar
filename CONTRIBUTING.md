# Contributing to Kovar

## Setup

```bash
git clone https://github.com/Orla-Labs/kovar.git
cd kovar
npm install
npx playwright install chromium
```

## Development

```bash
npm run dev          # watch mode build
npm run test:watch   # watch mode unit tests
```

## Testing

```bash
npm run test              # unit tests (vitest)
npm run test:integration  # integration tests (playwright)
npm run typecheck         # type checking
npm run lint              # linting (biome)
npm run lint:fix          # auto-fix lint issues
npm run build             # full build (ESM + CJS + DTS + CLI)
```

All four must pass before submitting a PR: `npm run lint && npm run typecheck && npm run test && npx playwright test`

## Architecture

Kovar has two main subsystems: **security checks** and the **recorder**. See `CLAUDE.md` for full architecture details.

```
src/
  checks/         Pure analysis functions (headers, cookies, XSS). Zero Playwright imports.
  matchers/       Playwright expect.extend() wrappers. Thin layer calling checks.
  fixtures/       test.extend() with security fixture. Orchestrates checks via audit registry.
  payloads/       XSS polyglot payloads (quick, standard, thorough).
  recorder/       AI-powered browser recording + codegen.
  recorder/llm/   LLM providers (Anthropic, OpenAI) and system prompt.
  plugins/        Vite/Next.js/Babel plugins for source mapping.
  source/         AST parser for component metadata extraction.
  reporter/       Playwright reporter for security findings.
  types/          Shared TypeScript types.
```

## Adding Security Checks

### New header rule

Add a new entry to `HEADER_RULES` in `src/checks/headers.ts`. Each rule needs:

- `id` -- unique identifier (e.g., `"header-missing-xxx"`)
- `header` -- lowercase header name
- `severity` -- `"critical" | "high" | "medium" | "low" | "info"`
- `check` -- function taking the header value and returning `{ pass, message }`
- `remediation` -- user-facing fix guidance

Then add tests in `tests/unit/checks/headers.test.ts`.

### New cookie check

Add a detection function following the `check*` pattern in `src/checks/cookies.ts` (e.g., `checkPartitioned`). Wire it into the `checks` array inside `analyzeCookies()`. Add session cookie name patterns to `DEFAULT_SESSION_PATTERNS` if needed.

Then add tests in `tests/unit/checks/cookies.test.ts`.

### New XSS payload

Add a `PayloadDefinition` entry to `src/payloads/xss-polyglots.ts`:

```typescript
{
  id: "poly-NNN",
  name: "descriptive name",
  payload: `<vector onerror="alert('${CANARY}-poly-NNN')">`,
  contexts: ["html-body"],          // where this payload targets
  depth: "standard",                // "quick" | "standard" | "thorough"
}
```

Requirements:
- Must include the `kovar-xss` canary prefix in its alert call
- Must contain an executable pattern (alert, onerror, onload, etc.)
- Must have a unique id
- Choose the correct depth: `quick` for common vectors, `standard` for evasion techniques, `thorough` for edge cases

Update the payload count in `tests/unit/checks/xss.test.ts`.

### New check category (e.g., CSRF, CORS)

1. Add a pure function in `src/checks/` returning `SecurityFinding[]`
2. Add the category to `FindingCategory` union in `src/types/results.ts`
3. Add an options interface in `src/types/options.ts`
4. Add a matcher in `src/matchers/` extending expect
5. Add a `CheckFacade` in `src/fixtures/security-fixture.ts`
6. Register it in the audit system:
   ```typescript
   this.registerAuditCheck({
     name: "csrf",
     run: (opts) => this.checkCSRF(opts.csrf),
     optIn: true,  // or false for always-on
   });
   ```
7. Add unit tests in `tests/unit/checks/` and integration tests in `tests/integration/`

## Adding Recorder Features

### Browser-side changes

Modify the `ACTION_CAPTURE_SCRIPT` template string in `src/recorder/action-capture.ts`. This is vanilla JS injected into the page via `page.addInitScript()`. No TypeScript, no imports -- it must be self-contained.

### Type changes

Update `src/recorder/types.ts` with new fields on `CapturedElement`, `RecordedAction`, or `RecordedRequest`.

### LLM prompt changes

Edit `src/recorder/llm/prompt.ts`. The system prompt defines the code generation rules. The user prompt is built from session data. Keep token budgets in mind -- the dynamic budgeting (`networkBudget = max(2000, 8000 - actionTokens)`) is intentional.

### Codegen validation

If your feature changes what gets generated, update the validation in `src/recorder/codegen.ts`:
- `DANGEROUS_PATTERNS` -- patterns that reject generated code
- `HARDCODED_SECRET_PATTERNS` -- patterns that catch leaked credentials
- `validateSpecCode()` -- must pass for generated code to be written

## Adding Framework Plugins

1. Add a plugin entry in `src/plugins/` (e.g., `src/plugins/webpack.ts`)
2. The plugin must inject `data-kovar-file`, `data-kovar-line`, `data-kovar-col` attributes into JSX elements at compile time
3. Export from a subpath via `package.json` exports map (e.g., `"./webpack"`)
4. Add a build entry in `tsup.config.ts`
5. Add AST extraction logic in `src/source/` if the framework uses a non-standard JSX transform
6. Add integration tests verifying attributes appear in rendered DOM

## Code Style

- TypeScript strict mode, ES2022 target
- Biome for formatting (tabs, 100 char line width)
- No unnecessary comments -- code should be self-documenting
- No runtime dependencies -- only peer dep on `@playwright/test`
- Browser-side code injected as template strings via `page.evaluate`/`addInitScript`
- All security checks return `SecurityFinding[]` arrays
- Matchers return `{ pass, message, name, expected, actual }`

## Pull Requests

- Run `npm run lint:fix` before committing
- Ensure all tests pass: `npm run lint && npm run typecheck && npm run test && npx playwright test`
- Keep PRs focused -- one feature or fix per PR
- No hardcoded credentials or API keys
- No `eval()`, `require()`, `fs.*`, or `child_process` in generated code paths
