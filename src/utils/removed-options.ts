/**
 * Options that were documented but never implemented, removed in 0.7.0. They throw
 * instead of being ignored, so a caller relying on them learns it was a no-op.
 */
const REMOVED_OPTIONS: Record<string, string> = {
	allowXFrameOptionsSameOrigin:
		"X-Frame-Options: SAMEORIGIN is always accepted, and a CSP frame-ancestors directive supersedes X-Frame-Options",
	expectedStatus:
		"the auth check treats any 2xx as unprotected and any other status (401, 403, 404, 3xx...) as rejected",
	tokenCookies:
		"the CSRF check probes like a cross-site form and never read token cookies; use tokenHeaders for header-based tokens",
};

export function rejectRemovedOptions(
	check: string,
	options: object | undefined,
	names: readonly (keyof typeof REMOVED_OPTIONS)[],
): void {
	if (!options) return;
	for (const name of names) {
		if (Object.hasOwn(options, name)) {
			throw new Error(
				`[kovar] ${check}: the "${name}" option was removed in 0.7.0 because it never had any effect: ${REMOVED_OPTIONS[name]}. Remove it from your options.`,
			);
		}
	}
}
