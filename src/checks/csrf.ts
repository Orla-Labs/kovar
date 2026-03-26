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

async function checkMethodWithoutToken(
	request: APIRequestContext,
	url: string,
	method: "POST" | "PUT" | "DELETE" | "PATCH",
): Promise<SecurityFinding | null> {
	try {
		const response = await request.fetch(url, {
			method,
			headers: {
				"content-type": "application/json",
			},
			data: "{}",
		});
		const status = response.status();
		if (status >= 200 && status < 300) {
			return {
				id: "csrf-unprotected-endpoint",
				category: "access-control",
				severity: "critical",
				message: `${method} ${url} returned ${status} without a CSRF token — endpoint accepts state-changing requests without CSRF protection`,
				remediation:
					"Implement CSRF protection using synchronizer tokens, double-submit cookies, or SameSite cookie attributes",
				url,
				cweId: "CWE-352",
			};
		}
	} catch {
		// Network errors are not security findings
	}
	return null;
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

		for (const method of methods) {
			const finding = await checkMethodWithoutToken(request, endpoint, method);
			if (finding) findings.push(finding);
		}

		const tokenFinding = await checkResponseForCSRFToken(request, endpoint, tokenHeaders);
		if (tokenFinding) findings.push(tokenFinding);

		const sameSiteFinding = await checkSameSiteCookies(request, endpoint);
		if (sameSiteFinding) findings.push(sameSiteFinding);
	}

	return findings;
}
