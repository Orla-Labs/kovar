import type { HeaderCheckOptions, SecurityFinding } from "../types/index.js";

interface HeaderRule {
	id: string;
	header: string;
	severity: SecurityFinding["severity"];
	check: (value: string | undefined) => { pass: boolean; message: string };
	remediation: string;
	cweId: string;
}

function parseMaxAge(value: string): number {
	const match = value.match(/max-age\s*=\s*"?(\d+)"?/i);
	return match?.[1] ? Number.parseInt(match[1], 10) : 0;
}

const DEFAULT_MIN_HSTS_MAX_AGE = 31536000;

/**
 * Playwright joins repeated response headers: allHeaders()/APIResponse.headers()
 * use ", " and Response.headers() uses "\n". For single-token headers, identical
 * repeats (framework + proxy both setting the header) are equivalent to one value.
 */
function collapseRepeatedToken(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const parts = [...new Set(value.split(/\s*[,\n]\s*/).map((p) => p.trim().toLowerCase()))];
	return parts.length === 1 ? (parts[0] ?? value) : value;
}

type CSPDirectives = Map<string, string[]>;

function parseCSPPolicies(header: string): CSPDirectives[] {
	return header
		.split(/[,\n]/)
		.map((policy) => {
			const directives: CSPDirectives = new Map();
			for (const raw of policy.split(";")) {
				const [name, ...sources] = raw.trim().split(/\s+/);
				if (!name) continue;
				const key = name.toLowerCase();
				if (!directives.has(key)) directives.set(key, sources);
			}
			return directives;
		})
		.filter((d) => d.size > 0);
}

const SCHEME_ONLY_SOURCE = /^(?:https?|data|blob|filesystem):$/i;

/** Returns why a single policy fails to restrict script execution, or null if it does. */
function weakScriptPolicy(policy: CSPDirectives): string | null {
	const defaultSrc = policy.get("default-src");
	if (defaultSrc?.some((s) => s === "*")) return "default-src allows any origin (*)";

	const scriptSrc = policy.get("script-src") ?? defaultSrc;
	if (!scriptSrc) return "no script-src or default-src, so scripts are unrestricted";

	const lower = scriptSrc.map((s) => s.toLowerCase());
	const hasNonceOrHash = lower.some((s) => /^'(?:nonce|sha256|sha384|sha512)-/.test(s));
	const strictDynamic = hasNonceOrHash && lower.includes("'strict-dynamic'");

	if (lower.includes("'unsafe-eval'")) return "script source allows 'unsafe-eval'";
	if (lower.includes("'unsafe-hashes'")) return "script source allows 'unsafe-hashes'";
	if (lower.includes("'unsafe-inline'") && !hasNonceOrHash) {
		return "script source allows 'unsafe-inline' without a nonce or hash";
	}
	// With 'strict-dynamic' + nonce/hash, CSP3 browsers ignore host and scheme sources.
	if (!strictDynamic) {
		const wildcard = lower.find((s) => s.includes("*"));
		if (wildcard) return `script source allows wildcard ${wildcard}`;
		const scheme = lower.find((s) => SCHEME_ONLY_SOURCE.test(s));
		if (scheme) return `script source allows any URL with scheme ${scheme}`;
	}
	return null;
}

/**
 * Multiple policies are all enforced, so the page is protected if ANY policy
 * restricts scripts. Returns a reason string when none does.
 */
function cspWeakness(header: string): string | null {
	const policies = parseCSPPolicies(header);
	if (policies.length === 0) return "policy is empty";
	const reasons = policies.map(weakScriptPolicy);
	return reasons.every((r) => r !== null) ? (reasons[0] as string) : null;
}

function hasFrameAncestors(csp: string | undefined): boolean {
	if (!csp) return false;
	return parseCSPPolicies(csp).some((p) => p.has("frame-ancestors"));
}

const HEADER_RULES: HeaderRule[] = [
	{
		id: "header-missing-hsts",
		header: "strict-transport-security",
		severity: "critical",
		cweId: "CWE-319",
		check: (value) => {
			if (!value) return { pass: false, message: "HSTS header is missing" };
			const maxAge = parseMaxAge(value);
			if (maxAge < DEFAULT_MIN_HSTS_MAX_AGE) {
				return {
					pass: false,
					message: `HSTS max-age is ${maxAge}, should be >= ${DEFAULT_MIN_HSTS_MAX_AGE}`,
				};
			}
			return { pass: true, message: "" };
		},
		remediation: "Set Strict-Transport-Security: max-age=63072000; includeSubDomains",
	},
	{
		id: "header-missing-csp",
		header: "content-security-policy",
		severity: "critical",
		cweId: "CWE-693",
		check: (value) => {
			if (!value) return { pass: false, message: "Content-Security-Policy header is missing" };
			const weakness = cspWeakness(value);
			if (weakness) {
				return {
					pass: false,
					message: `Content-Security-Policy is overly permissive (${weakness}): ${value.substring(0, 100)}`,
				};
			}
			return { pass: true, message: "" };
		},
		remediation:
			"Set a Content-Security-Policy header. Start with: default-src 'self'; script-src 'self'",
	},
	{
		id: "header-missing-xcto",
		header: "x-content-type-options",
		severity: "high",
		cweId: "CWE-16",
		check: (value) => {
			if (!value) return { pass: false, message: "X-Content-Type-Options header is missing" };
			if (collapseRepeatedToken(value) !== "nosniff") {
				return {
					pass: false,
					message: `X-Content-Type-Options is "${value}", should be "nosniff"`,
				};
			}
			return { pass: true, message: "" };
		},
		remediation: "Set X-Content-Type-Options: nosniff",
	},
	{
		id: "header-missing-xfo",
		header: "x-frame-options",
		severity: "high",
		cweId: "CWE-1021",
		check: (value) => {
			if (!value) return { pass: false, message: "X-Frame-Options header is missing" };
			const upper = (collapseRepeatedToken(value) ?? value).toUpperCase();
			if (upper !== "DENY" && upper !== "SAMEORIGIN") {
				return {
					pass: false,
					message: `X-Frame-Options is "${value}", should be "DENY" or "SAMEORIGIN"`,
				};
			}
			return { pass: true, message: "" };
		},
		remediation: "Set X-Frame-Options: DENY (or SAMEORIGIN if framing is needed)",
	},
	{
		id: "header-missing-referrer-policy",
		header: "referrer-policy",
		severity: "medium",
		cweId: "CWE-693",
		check: (value) => {
			if (!value) return { pass: false, message: "Referrer-Policy header is missing" };
			if (value.toLowerCase() === "unsafe-url") {
				return { pass: false, message: 'Referrer-Policy is "unsafe-url", which leaks full URLs' };
			}
			return { pass: true, message: "" };
		},
		remediation: "Set Referrer-Policy: strict-origin-when-cross-origin",
	},
	{
		id: "header-missing-permissions-policy",
		header: "permissions-policy",
		severity: "medium",
		cweId: "CWE-693",
		check: (value) => {
			if (!value) return { pass: false, message: "Permissions-Policy header is missing" };
			return { pass: true, message: "" };
		},
		remediation:
			"Set Permissions-Policy to restrict browser features: camera=(), microphone=(), geolocation=()",
	},
	{
		id: "header-missing-coop",
		header: "cross-origin-opener-policy",
		severity: "low",
		cweId: "CWE-693",
		check: (value) => {
			if (!value) return { pass: false, message: "Cross-Origin-Opener-Policy header is missing" };
			return { pass: true, message: "" };
		},
		remediation: "Set Cross-Origin-Opener-Policy: same-origin",
	},
	{
		id: "header-missing-corp",
		header: "cross-origin-resource-policy",
		severity: "low",
		cweId: "CWE-693",
		check: (value) => {
			if (!value) return { pass: false, message: "Cross-Origin-Resource-Policy header is missing" };
			return { pass: true, message: "" };
		},
		remediation: "Set Cross-Origin-Resource-Policy: same-origin",
	},
	{
		id: "header-missing-coep",
		header: "cross-origin-embedder-policy",
		severity: "low",
		cweId: "CWE-693",
		check: (value) => {
			if (!value) return { pass: false, message: "Cross-Origin-Embedder-Policy header is missing" };
			return { pass: true, message: "" };
		},
		remediation: "Set Cross-Origin-Embedder-Policy: require-corp",
	},
	{
		id: "header-deprecated-xxp",
		header: "x-xss-protection",
		severity: "info",
		cweId: "CWE-16",
		check: (value) => {
			if (value && value !== "0") {
				return {
					pass: false,
					message:
						'X-XSS-Protection is set to a non-zero value. Modern browsers ignore this header and it can introduce vulnerabilities. Set to "0" or remove it.',
				};
			}
			return { pass: true, message: "" };
		},
		remediation: "Set X-XSS-Protection: 0 (or remove the header entirely). Rely on CSP instead.",
	},
	{
		id: "header-remove-x-powered-by",
		header: "x-powered-by",
		severity: "low",
		cweId: "CWE-16",
		check: (value) => {
			if (value) {
				return {
					pass: false,
					message: `X-Powered-By header exposes server technology: "${value}"`,
				};
			}
			return { pass: true, message: "" };
		},
		remediation: "Remove the X-Powered-By header to avoid exposing server technology",
	},
	{
		id: "header-remove-server",
		header: "server",
		severity: "info",
		cweId: "CWE-16",
		check: (value) => {
			if (value?.match(/\d/)) {
				return {
					pass: false,
					message: `Server header exposes version information: "${value}"`,
				};
			}
			return { pass: true, message: "" };
		},
		remediation: "Remove version information from the Server header",
	},
];

function shouldSkipRule(rule: HeaderRule, options?: HeaderCheckOptions): boolean {
	if (options?.skip?.some((h) => h.toLowerCase() === rule.header)) return true;
	if (options?.only && !options.only.some((h) => h.toLowerCase() === rule.header)) return true;
	return false;
}

function evaluateRule(
	rule: HeaderRule,
	normalized: Record<string, string>,
	options?: HeaderCheckOptions,
): { pass: boolean; message: string } {
	const value = normalized[rule.header];

	// CSP frame-ancestors supersedes X-Frame-Options in every current browser.
	if (
		rule.id === "header-missing-xfo" &&
		hasFrameAncestors(normalized["content-security-policy"])
	) {
		return { pass: true, message: "" };
	}

	if (rule.id === "header-missing-hsts" && options?.minHSTSMaxAge !== undefined) {
		const minAge = options.minHSTSMaxAge;
		if (!value) return { pass: false, message: "HSTS header is missing" };
		const maxAge = parseMaxAge(value);
		return maxAge < minAge
			? { pass: false, message: `HSTS max-age is ${maxAge}, should be >= ${minAge}` }
			: { pass: true, message: "" };
	}

	return rule.check(value);
}

function validateCSPDirectives(
	normalized: Record<string, string>,
	options: HeaderCheckOptions | undefined,
	findings: SecurityFinding[],
): void {
	if (!options?.requiredCSPDirectives || !normalized["content-security-policy"]) return;

	const csp = normalized["content-security-policy"];
	for (const directive of options.requiredCSPDirectives) {
		if (!csp.includes(directive)) {
			findings.push({
				id: `header-csp-missing-directive-${directive}`,
				category: "headers",
				severity: "high",
				header: "content-security-policy",
				message: `CSP is missing required directive: ${directive}`,
				remediation: `Add the "${directive}" directive to your Content-Security-Policy`,
				cweId: "CWE-693",
			});
		}
	}
}

export function analyzeHeaders(
	headers: Record<string, string>,
	options?: HeaderCheckOptions,
): SecurityFinding[] {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		normalized[key.toLowerCase()] = value;
	}

	const findings: SecurityFinding[] = [];

	for (const rule of HEADER_RULES) {
		if (shouldSkipRule(rule, options)) continue;

		const result = evaluateRule(rule, normalized, options);

		if (!result.pass) {
			findings.push({
				id: rule.id,
				category: "headers",
				severity: rule.severity,
				header: rule.header,
				message: result.message,
				remediation: rule.remediation,
				cweId: rule.cweId,
			});
		}
	}

	validateCSPDirectives(normalized, options, findings);

	return findings;
}
