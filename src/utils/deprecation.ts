/**
 * One-time deprecation warnings for surfaces leaving Kovar in 0.8.
 *
 * Written with process.emitWarning, so they go to stderr (never stdout, which is the
 * JSON-RPC channel of `kovar mcp`) and respect `node --no-deprecation`. Deduplicated
 * through a global registry because tsup bundles this helper into several entries.
 */
const REGISTRY = Symbol.for("@orlalabs/kovar.deprecations");

export const DEPRECATIONS = {
	KOVAR_DEP_MCP:
		"The Kovar MCP server (`kovar mcp`, `kovar mcp proxy`, `kovar ingest`, `@orlalabs/kovar/mcp`) is deprecated and will be removed in Kovar 0.8. It is moving to Orla Labs Caliper.",
	KOVAR_DEP_RECORDER:
		"The Kovar recorder (`kovar record`, including --heal) is deprecated and will be removed in Kovar 0.8. Playwright's own codegen and test agents cover this use case.",
	KOVAR_DEP_A11Y:
		"Kovar's accessibility check (`toBeAccessible`, `security.accessibility`, `checkAccessibility`) is deprecated and will be removed in Kovar 0.8. Use @axe-core/playwright instead: https://playwright.dev/docs/accessibility-testing",
} as const;

export type DeprecationCode = keyof typeof DEPRECATIONS;

export function warnDeprecated(code: DeprecationCode): void {
	const g = globalThis as unknown as Record<symbol, Set<string> | undefined>;
	const seen = g[REGISTRY] ?? new Set<string>();
	g[REGISTRY] = seen;
	if (seen.has(code)) return;
	seen.add(code);
	process.emitWarning(DEPRECATIONS[code], { type: "DeprecationWarning", code });
}
