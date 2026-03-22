# Kovar

Security testing assertions + AI-powered test recording for Playwright.

## Architecture

Three-layer design:
- `src/checks/` — Pure analysis functions (headers, cookies, XSS). Zero Playwright imports.
- `src/matchers/` — Playwright `expect.extend()` wrappers. Thin layer calling checks.
- `src/fixtures/` — `test.extend()` with `security` fixture. Orchestrates checks.
- `src/recorder/` — AI-powered browser recording. CLI, action capture, LLM codegen.
- `src/recorder/llm/` — LLM providers (Anthropic, OpenAI) and system prompt for POM generation.
- `src/reporter/` — Playwright reporter for security findings.
- `src/plugins/` — Vite/Next.js/Babel plugins for source mapping (codebase awareness).
- `src/source/` — AST parser with file caching for component metadata extraction.
- `src/types/` — Shared TypeScript types (findings, options, payloads, matcher augmentation).
- `src/payloads/` — XSS polyglot payloads.

## Key Files

- `src/index.ts` — Main export: `test`, `expect` (with fixtures + matchers)
- `src/core.ts` — Standalone API without fixtures
- `src/cli.ts` — CLI entry point for `kovar record`
- `src/recorder/index.ts` — RecordingSession orchestrator
- `src/recorder/llm/prompt.ts` — LLM system prompt for POM generation
- `src/recorder/locator-generator.ts` — LocatorStrategy with confidence scoring
- `src/recorder/action-capture.ts` — Browser-side JS injection for event capture
- `src/recorder/network-capture.ts` — Fetch/XHR interception with body limits
- `src/recorder/codegen.ts` — Multi-file POM code generation + security validation
- `src/recorder/toolbar.ts` — Shadow DOM toolbar overlay
- `src/plugins/vite.ts` — Vite plugin injecting `data-kovar-source` attributes
- `src/plugins/next.ts` — Next.js wrapper (disables SWC, enables Babel plugin)
- `src/plugins/babel.ts` — Babel plugin entry point
- `src/plugins/babel-transform.ts` — Babel AST visitor for JSX source attribute injection
- `src/source/parser.ts` — AST parser extracting testId, ariaLabel, event handlers from source
- `src/source/types.ts` — ComponentMeta and related types

## Commands

```bash
npm run build          # Build ESM + CJS + DTS + CLI
npm run test           # Unit tests (vitest)
npm run test:integration  # Integration tests (playwright)
npm run typecheck      # TypeScript strict check
npm run lint           # Biome linting
npm run lint:fix       # Auto-fix lint issues
```

## Conventions

- TypeScript strict mode, ES2022 target
- Biome for formatting (tabs, 100 char line width)
- No unnecessary comments — code should be self-documenting
- No runtime dependencies — only peer dep on @playwright/test
- Browser-side code injected as template strings via page.evaluate/addInitScript
- All security checks return SecurityFinding[] arrays
- Matchers use ExpectMatcherState, return { pass, message, name, expected, actual }
- Tests: vitest for unit, playwright for integration

## Adding Features

### New security check
1. Add pure function in `src/checks/` returning SecurityFinding[]
2. Add matcher in `src/matchers/` extending expect
3. Add facade in `src/fixtures/security-fixture.ts`
4. Add tests in `tests/unit/checks/` and `tests/integration/`

### New XSS payload
1. Add to `src/payloads/xss-polyglots.ts` with `kovar-xss` canary prefix
2. Must include `depth` field (quick/standard/thorough)

### New recorder feature
1. Browser-side changes go in ACTION_CAPTURE_SCRIPT string in `src/recorder/action-capture.ts`
2. Type changes go in `src/recorder/types.ts`
3. LLM prompt changes go in `src/recorder/llm/prompt.ts`

### New framework plugin
1. Add plugin entry in `src/plugins/` (e.g., `src/plugins/webpack.ts`)
2. Plugin must inject `data-kovar-source` attributes at compile time with file path, component name, and line number
3. Export from a subpath (e.g., `kovar/webpack`) via `package.json` exports map
4. Add AST extraction logic in `src/source/` if the framework uses a non-standard JSX transform
5. Add integration test in `tests/integration/` verifying attributes appear in rendered DOM

## Review Process

Code is reviewed by 3 agent roles:
- QA Tech Lead — test quality, selector resilience, DX
- Security Tech Lead — data leakage, injection, credential handling
- Principal SDET — architecture, TypeScript quality, build correctness
