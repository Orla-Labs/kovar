import type { APIRequestContext } from "@playwright/test";
import type { SecurityFinding } from "../types/results.js";

export interface CSRFCheckOptions {
	endpoints?: string[];
	methods?: ("POST" | "PUT" | "DELETE" | "PATCH")[];
	tokenHeaders?: string[];
	tokenCookies?: string[];
	skip?: string[];
}

const DEFAULT_METHODS = ["POST", "PUT", "DELETE", "PATCH"] as const;
const DEFAULT_TOKEN_HEADERS = ["x-csrf-token", "x-xsrf-token"];

function shouldSkip(url: string, patterns: string[]): boolean {
	return patterns.some((p) => url.includes(p));
}

// A cross-site attacker page can only send "simple" requests without a CORS
// preflight: form-urlencoded / multipart / text/plain bodies, and the browser
// always attaches Origin and Sec-Fetch-Site. Probe exactly that shape, so that
// JSON-only endpoints and Origin / Fetch-Metadata defenses are judged correctly.
const ATTACKER_ORIGIN = "https://kovar-csrf-probe.example";
const LOGIN_LIKE_PATH = /\/(?:log-?in|sign-?in|sign_in|auth|sso|oauth|session)(?:[/?#.]|$)/i;

type ProbeOutcome =
	| { kind: "accepted"; status: number; via?: string }
	| { kind: "rejected" }
	| { kind: "unauthenticated"; status: number; via?: string }
	| { kind: "error"; message: string };

function classifyRedirect(url: string, status: number, location: string | undefined): ProbeOutcome {
	if (!location) return { kind: "rejected" };
	let target: URL;
	try {
		target = new URL(location, url);
	} catch {
		return { kind: "rejected" };
	}
	if (target.origin !== new URL(url).origin || LOGIN_LIKE_PATH.test(target.pathname)) {
		return { kind: "unauthenticated", status, via: target.href };
	}
	// Same-origin, non-login redirect: Post/Redirect/Get after a successful write.
	return { kind: "accepted", status, via: target.href };
}

async function probeCrossSiteRequest(
	request: APIRequestContext,
	url: string,
	method: "POST" | "PUT" | "DELETE" | "PATCH",
): Promise<ProbeOutcome> {
	try {
		const response = await request.fetch(url, {
			method,
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				origin: ATTACKER_ORIGIN,
				"sec-fetch-site": "cross-site",
				"sec-fetch-mode": "navigate",
				"sec-fetch-dest": "document",
			},
			data: "kovar_csrf_probe=1",
			maxRedirects: 0,
		});
		const status = response.status();
		if (status >= 200 && status < 300) return { kind: "accepted", status };
		if (status >= 300 && status < 400) {
			return classifyRedirect(url, status, response.headers().location);
		}
		if (status === 401) return { kind: "unauthenticated", status };
		return { kind: "rejected" };
	} catch (error: unknown) {
		return { kind: "error", message: error instanceof Error ? error.message : String(error) };
	}
}

function unprotectedFinding(
	url: string,
	method: string,
	outcome: { status: number; via?: string },
): SecurityFinding {
	const via = outcome.via ? ` (redirected to ${outcome.via})` : "";
	return {
		id: "csrf-unprotected-endpoint",
		category: "access-control",
		severity: "critical",
		message: `${method} ${url} returned ${outcome.status}${via} for a cross-site form request with no CSRF token — endpoint accepts state-changing requests without CSRF protection`,
		remediation:
			"Implement CSRF protection using synchronizer tokens, double-submit cookies, Origin / Sec-Fetch-Site checks, or SameSite cookie attributes",
		url,
		cweId: "CWE-352",
	};
}

async function checkEndpointMethods(
	request: APIRequestContext,
	url: string,
	methods: readonly ("POST" | "PUT" | "DELETE" | "PATCH")[],
): Promise<SecurityFinding[]> {
	const findings: SecurityFinding[] = [];
	let unauthenticated: { status: number; via?: string } | null = null;
	const errors: string[] = [];

	for (const method of methods) {
		const outcome = await probeCrossSiteRequest(request, url, method);
		if (outcome.kind === "accepted") findings.push(unprotectedFinding(url, method, outcome));
		else if (outcome.kind === "unauthenticated") unauthenticated ??= outcome;
		else if (outcome.kind === "error") errors.push(outcome.message);
	}

	if (findings.length === 0 && unauthenticated) {
		const via = unauthenticated.via ? ` (redirected to ${unauthenticated.via})` : "";
		findings.push({
			id: "csrf-check-unauthenticated",
			category: "access-control",
			severity: "high",
			message: `${url} answered ${unauthenticated.status}${via}: the request was not authenticated, so CSRF protection could NOT be evaluated`,
			remediation:
				"CSRF only matters for requests that carry the victim's session. Pass an authenticated request context (e.g. page.context().request after logging in). If this endpoint authenticates with an Authorization header rather than cookies it is not CSRF-exposed; skip it.",
			url,
			cweId: "CWE-352",
		});
	}

	if (errors.length === methods.length && methods.length > 0) {
		findings.push({
			id: "csrf-check-error",
			category: "access-control",
			severity: "high",
			message: `CSRF could not be checked for ${url}: ${errors[0]}`,
			remediation:
				"Kovar could not reach the endpoint, so CSRF protection was NOT verified. Make sure the server is running and the URL is correct.",
			url,
		});
	}

	return findings;
}

async function checkResponseForCSRFToken(
	request: APIRequestContext,
	url: string,
	tokenHeaders: string[],
): Promise<SecurityFinding | null> {
	try {
		const response = await request.get(url);
		const headers = response.headers();
		const normalizedHeaders: Record<string, string> = {};
		for (const [key, value] of Object.entries(headers)) {
			normalizedHeaders[key.toLowerCase()] = value;
		}

		const hasTokenHeader = tokenHeaders.some((h) => normalizedHeaders[h.toLowerCase()]);

		const body = await response.text();
		const hasMetaToken = /<meta[^>]+name=["']csrf[^"']*["'][^>]*>/i.test(body);

		if (!hasTokenHeader && !hasMetaToken) {
			return {
				id: "csrf-no-token-in-response",
				category: "access-control",
				severity: "medium",
				message: `No CSRF token found in response headers or meta tags for ${url}`,
				remediation:
					"Include a CSRF token in responses via a custom header (e.g., X-CSRF-Token) or a <meta> tag so clients can submit it with state-changing requests",
				url,
				cweId: "CWE-352",
			};
		}
	} catch {
		// Network errors are not security findings
	}
	return null;
}

async function checkSameSiteCookies(
	request: APIRequestContext,
	url: string,
): Promise<SecurityFinding | null> {
	try {
		const response = await request.get(url);
		const setCookieHeaders = response
			.headersArray()
			.filter((h) => h.name.toLowerCase() === "set-cookie");

		for (const header of setCookieHeaders) {
			const value = header.value.toLowerCase();
			if (value.includes("samesite=none") || !value.includes("samesite")) {
				return {
					id: "csrf-weak-samesite",
					category: "access-control",
					severity: "medium",
					message: `Cookies at ${url} lack SameSite=Strict or SameSite=Lax — weakens CSRF defense-in-depth`,
					remediation:
						"Set SameSite=Lax or SameSite=Strict on cookies to provide defense-in-depth against CSRF attacks",
					url,
					cweId: "CWE-352",
				};
			}
		}
	} catch {
		// Network errors are not security findings
	}
	return null;
}

export async function checkCSRF(
	request: APIRequestContext,
	url: string,
	options?: CSRFCheckOptions,
): Promise<SecurityFinding[]> {
	const methods = options?.methods ?? DEFAULT_METHODS;
	const tokenHeaders = options?.tokenHeaders ?? DEFAULT_TOKEN_HEADERS;
	const skip = options?.skip ?? [];
	const endpoints = options?.endpoints ?? [url];
	const findings: SecurityFinding[] = [];

	for (const endpoint of endpoints) {
		if (shouldSkip(endpoint, skip)) continue;

		findings.push(...(await checkEndpointMethods(request, endpoint, methods)));

		const tokenFinding = await checkResponseForCSRFToken(request, endpoint, tokenHeaders);
		if (tokenFinding) findings.push(tokenFinding);

		const sameSiteFinding = await checkSameSiteCookies(request, endpoint);
		if (sameSiteFinding) findings.push(sameSiteFinding);
	}

	return findings;
}
