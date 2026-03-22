import type { SourceMetadata } from "../../source/types.js";
import { generateLocator } from "../locator-generator.js";
import type { RecordedAction, RecordedRequest, SessionData } from "../types.js";

function sanitizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const hashPath = parsed.hash.startsWith("#/") ? parsed.hash : "";
		return `${parsed.origin}${parsed.pathname}${hashPath}`;
	} catch {
		return url.split(/[?]/)[0] ?? url;
	}
}

const SYSTEM_PROMPT = `You are a Playwright test code generator that produces Page Object Model (POM) structured output.

## Output Format

You MUST output exactly TWO code blocks:

\`\`\`typescript:pages
// Page object classes
\`\`\`

\`\`\`typescript:spec
// Test spec
\`\`\`

## Page Object Rules

1. One class per logical page/section
2. Constructor takes \`page: Page\`
3. Locators as private getters: \`private get emailInput() { return this.page.getByRole('textbox', { name: 'Email' }); }\`
4. User actions as public async methods: \`async login(email: string, password: string) { ... }\`
5. navigate() MUST use BASE_URL: \`async navigate() { await this.page.goto(\\\`\\\${process.env.BASE_URL}/login\\\`); }\`
6. NEVER hardcode full URLs like 'https://example.com' — always use process.env.BASE_URL
7. Use resilient locators: getByRole > getByText > getByTestId > getByPlaceholder > locator('css')
8. Group related actions into meaningful methods (login, search, checkout — not click, fill, click)

## Spec File Rules

1. Import page objects from './pages/{name}.page'
2. Define environment variables at the top:
   \`const BASE_URL = process.env.BASE_URL ?? '';\`
   \`const EMAIL = process.env.TEST_EMAIL ?? '';\`
   \`const PASSWORD = process.env.TEST_PASSWORD ?? '';\`
3. NEVER hardcode the recorded URL — it changes between environments
4. Add "// Intent:" comments before logical action groups
5. End with meaningful assertions
6. Import from '@playwright/test'

## Anti-Patterns (NEVER DO THESE)

- NEVER use .or() chains for locators — pick ONE reliable selector
- NEVER write the same assertion twice in a row
- NEVER hardcode URLs, emails, passwords, or tokens
- NEVER generate assertions without actions (a test must DO something, not just verify the page loaded)
- NEVER use generic test names like 'recorded-test' — derive from the flow (e.g., 'user logs in and views dashboard')

## Credential Handling

When you see [EMAIL], [PASSWORD], [PHONE], [REDACTED], [CARD], [TOKEN]:
- Page objects: accept as method parameters
- Spec files: read from process.env
- NEVER hardcode masked values

## Example Output

\`\`\`typescript:pages
import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  private get emailInput() { return this.page.getByRole('textbox', { name: 'Email' }); }
  private get passwordInput() { return this.page.getByRole('textbox', { name: 'Password' }); }
  private get submitButton() { return this.page.getByRole('button', { name: 'Sign In' }); }

  async navigate() {
    await this.page.goto(\\\`\\\${process.env.BASE_URL}/login\\\`);
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
\`\`\`

\`\`\`typescript:spec
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';

const EMAIL = process.env.TEST_EMAIL ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

test('user logs in successfully', async ({ page }) => {
  const loginPage = new LoginPage(page);

  // Intent: Navigate and authenticate
  await loginPage.navigate();
  await loginPage.login(EMAIL, PASSWORD);

  // Intent: Verify successful login
  await expect(page).toHaveURL(/dashboard/);
});
\`\`\``;

function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

function formatNavigationAction(action: RecordedAction, index: number): string {
	return `${index + 1}. [${action.type}] Navigated to: ${action.url ? sanitizeUrl(action.url) : "unknown"}`;
}

function formatElementAction(
	action: RecordedAction,
	index: number,
	sourceMetadata?: SourceMetadata | null,
): string {
	const parts = [`${index + 1}. [${action.type}]`];

	if (sourceMetadata) {
		parts.push(
			`Component: ${sourceMetadata.componentName} (${sourceMetadata.filePath}:${sourceMetadata.line})`,
		);
		if (sourceMetadata.testId) parts.push(`Source testId: "${sourceMetadata.testId}"`);
		if (sourceMetadata.ariaLabel) parts.push(`Source aria-label: "${sourceMetadata.ariaLabel}"`);
		if (sourceMetadata.eventHandlers.length > 0) {
			parts.push(`Handlers: ${sourceMetadata.eventHandlers.join(", ")}`);
		}
	}

	if (action.element) {
		const strategy = generateLocator(action.element, sourceMetadata);
		parts.push(`Element: <${action.element.tagName}>`);
		if (action.element.nearbyHeading) parts.push(`Section: "${action.element.nearbyHeading}"`);
		parts.push(`Suggested locator: ${strategy.primary}`);
		if (strategy.fallbacks.length > 0) {
			parts.push(`Fallbacks: ${strategy.fallbacks.slice(0, 2).join(" | ")}`);
		}
		if (strategy.concerns.length > 0) {
			parts.push(`\u26A0 ${strategy.concerns.join("; ")}`);
		}
		parts.push(`Confidence: ${strategy.confidence}`);
	}

	if (action.value !== undefined) parts.push(`Value: "${action.value}"`);
	if (action.key) parts.push(`Key: ${action.key}`);

	return parts.join(" | ");
}

function formatAction(
	action: RecordedAction,
	index: number,
	sourceMetadata?: SourceMetadata | null,
): string {
	if (action.type === "navigation") {
		return formatNavigationAction(action, index);
	}
	return formatElementAction(action, index, sourceMetadata);
}

interface PageGroup {
	url: string;
	suggestedClassName: string;
	actions: RecordedAction[];
	/** Original indices from the flat session actions array, parallel to actions. */
	originalIndices: number[];
}

function groupActionsByPage(actions: RecordedAction[]): PageGroup[] {
	const groups: PageGroup[] = [];
	let currentUrl = "";

	for (let i = 0; i < actions.length; i++) {
		const action = actions[i];
		if (!action) continue;
		if (action.type === "navigation" && action.url) {
			currentUrl = action.url;
			const className = inferPageClassName(currentUrl);
			groups.push({
				url: currentUrl,
				suggestedClassName: className,
				actions: [],
				originalIndices: [],
			});
			continue;
		}
		if (groups.length === 0) {
			groups.push({
				url: currentUrl || "unknown",
				suggestedClassName: "HomePage",
				actions: [],
				originalIndices: [],
			});
		}
		const lastGroup = groups[groups.length - 1];
		if (lastGroup) {
			lastGroup.actions.push(action);
			lastGroup.originalIndices.push(i);
		}
	}

	return groups;
}

function inferPageClassName(url: string): string {
	try {
		const parsed = new URL(url);
		let path = parsed.pathname.replace(/^\/|\/$/g, "");
		// Handle hash-based routing
		if (parsed.hash.startsWith("#/")) {
			path = parsed.hash.slice(2).replace(/^\/|\/$/g, "");
		}
		if (!path) return "HomePage";
		const parts = path.split("/").filter(Boolean);
		const name = parts
			.map((p) => p.charAt(0).toUpperCase() + p.slice(1).replace(/[^a-zA-Z0-9]/g, ""))
			.join("");
		return `${name}Page`;
	} catch {
		return "HomePage";
	}
}

function formatRequest(req: RecordedRequest): string {
	let line = `${req.method} ${sanitizeUrl(req.url)} \u2192 ${req.responseStatus}`;
	if (req.requestPostData) {
		const truncated =
			req.requestPostData.length > 200
				? `${req.requestPostData.substring(0, 200)}...`
				: req.requestPostData;
		line += `\n   Body: ${truncated}`;
	}
	if (req.responseBody) {
		const truncated =
			req.responseBody.length > 500 ? `${req.responseBody.substring(0, 500)}...` : req.responseBody;
		line += `\n   Response: ${truncated}`;
	}
	return line;
}

const NOISE_URL_PATTERNS = [
	/cloudflare/i,
	/cdn-cgi/,
	/analytics/i,
	/tracking/i,
	/sentry/i,
	/hotjar/i,
	/google-analytics/i,
	/gtag/i,
	/facebook/i,
	/pixel/i,
	/beacon/i,
	/favicon/,
	/\.ico$/,
	/\.woff2?$/,
	/\.ttf$/,
	/\.svg$/,
	/\.png$/,
	/\.jpg$/,
	/\.gif$/,
	/\.css$/,
	/\.min\.js$/,
	/\.bundle\.js$/,
	/chunk-[a-z0-9]+\.js$/i,
	/sourcemap/i,
	/\.map$/,
];

function isRelevantRequest(req: RecordedRequest): boolean {
	if (req.resourceType !== "fetch" && req.resourceType !== "xhr") return false;
	if (req.url.includes("/api/") || req.url.includes("/graphql")) return true;
	if (NOISE_URL_PATTERNS.some((p) => p.test(req.url))) return false;
	if (req.method !== "GET" || req.responseStatus >= 400) return true;
	if (req.responseBody?.startsWith("{")) return true;
	return false;
}

function deduplicateRequests(requests: RecordedRequest[]): RecordedRequest[] {
	const seen = new Map<string, { request: RecordedRequest; count: number }>();
	for (const req of requests) {
		const key = `${req.method}:${sanitizeUrl(req.url)}:${req.responseStatus}`;
		const existing = seen.get(key);
		if (existing) {
			existing.count++;
		} else {
			seen.set(key, { request: req, count: 1 });
		}
	}
	return Array.from(seen.values()).map((entry) => {
		if (entry.count > 1) {
			return {
				...entry.request,
				url: `${entry.request.url} (×${entry.count})`,
			};
		}
		return entry.request;
	});
}

function trimRequests(requests: RecordedRequest[], budget: number): string {
	const relevant = requests.filter(isRelevantRequest);
	const deduplicated = deduplicateRequests(relevant);
	const mutating = deduplicated.filter((r) => r.method !== "GET");
	const gets = deduplicated.filter((r) => r.method === "GET");
	const prioritized = [...mutating, ...gets];

	let formatted = prioritized.map(formatRequest).join("\n\n");
	if (estimateTokens(formatted) <= budget) return formatted;

	formatted = prioritized
		.map((r) => `${r.method} ${sanitizeUrl(r.url)} \u2192 ${r.responseStatus}`)
		.join("\n");
	if (estimateTokens(formatted) <= budget) return formatted;

	const limited = prioritized.slice(0, 10);
	return limited
		.map((r) => `${r.method} ${sanitizeUrl(r.url)} \u2192 ${r.responseStatus}`)
		.join("\n");
}

export function buildPrompt(
	session: SessionData,
	testName: string,
	sourceMap?: Map<number, SourceMetadata>,
): { system: string; user: string } {
	const pageGroups = groupActionsByPage(session.actions);
	const actionsText = pageGroups
		.map((group) => {
			const header = `\n### Page: ${group.suggestedClassName} (${sanitizeUrl(group.url)})`;
			const actionsList = group.actions
				.map((a, i) => {
					const originalIndex = group.originalIndices[i] ?? i;
					const meta = sourceMap?.get(originalIndex) ?? null;
					return formatAction(a, i, meta);
				})
				.join("\n");
			return `${header}\n${actionsList}`;
		})
		.join("\n");

	const actionTokens = estimateTokens(actionsText);
	const networkBudget = Math.max(2000, 8000 - actionTokens);
	const networkText = trimRequests(session.requests, networkBudget);

	const userPrompt = `## Session Recording

### Starting URL
${sanitizeUrl(session.startUrl)}

### User Actions (${session.actions.length} total, chronological)
${actionsText}

### API Calls During Session
${networkText || "No API calls captured."}

### Final Page State
URL: ${sanitizeUrl(session.finalUrl)}
Title: ${session.pageTitle}

### Instructions
Generate a Page Object Model test for this user flow.
Test name: "${testName}"

Actions are grouped by page. Create one page object class per group.
Use the suggested class names (LoginPage, DashboardPage, etc.).

Output TWO code blocks:
1. \`\`\`typescript:pages \u2014 Page object classes (one class per page/section)
2. \`\`\`typescript:spec \u2014 Test spec that uses the page objects

Use process.env.TEST_EMAIL, process.env.TEST_PASSWORD etc. for any credentials.
Add "// Intent: ..." comments in the spec file to group logical actions.
End with appropriate expect() assertions.`;

	return { system: SYSTEM_PROMPT, user: userPrompt };
}
