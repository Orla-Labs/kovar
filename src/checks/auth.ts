import type { APIRequestContext } from "@playwright/test";
import type { SecurityFinding } from "../types/results.js";

export interface AuthCheckOptions {
	endpoints?: string[];
	methods?: ("GET" | "POST" | "PUT" | "DELETE")[];
	expectedStatus?: number;
}

const DEFAULT_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;

const SENSITIVE_BODY_PATTERNS = [
	/password/i,
	/secret/i,
	/api[_-]?key/i,
	/token/i,
	/private[_-]?key/i,
	/credit[_\- ]?card/i,
	/ssn/i,
	/social[_-]?security/i,
];

async function checkEndpointAuth(
	request: APIRequestContext,
	url: string,
	method: string,
): Promise<SecurityFinding[]> {
	const findings: SecurityFinding[] = [];

	try {
		const response = await request.fetch(url, {
			method,
			headers: {},
		});
		const status = response.status();

		if (status >= 200 && status < 300) {
			findings.push({
				id: "auth-missing-authentication",
				category: "authentication",
				severity: "critical",
				message: `${method} ${url} returned ${status} without authentication — endpoint is unprotected`,
				remediation:
					"Require authentication for this endpoint. Return 401 Unauthorized for unauthenticated requests.",
				url,
				cweId: "CWE-306",
			});
		} else if (status >= 300 && status < 400) {
			findings.push({
				id: "auth-redirect-based",
				category: "authentication",
				severity: "info",
				message: `${method} ${url} returned ${status} redirect instead of 401/403 — redirect-based auth is not ideal for APIs`,
				remediation:
					"For API endpoints, return 401 or 403 status codes instead of redirecting to a login page",
				url,
				cweId: "CWE-284",
			});
		}

		if (status === 401 || status === 403) {
			const body = await response.text();
			const leaksInfo = SENSITIVE_BODY_PATTERNS.some((p) => p.test(body));
			if (leaksInfo) {
				findings.push({
					id: "auth-error-info-leak",
					category: "information-disclosure",
					severity: "medium",
					message: `${method} ${url} error response may leak sensitive information in the response body`,
					remediation:
						"Ensure 401/403 error responses do not contain sensitive keywords or data. Return generic error messages.",
					url,
					cweId: "CWE-209",
				});
			}
		}
	} catch {
		// Network errors are not security findings
	}

	return findings;
}

export async function checkAuth(
	request: APIRequestContext,
	url: string,
	options?: AuthCheckOptions,
): Promise<SecurityFinding[]> {
	const methods = options?.methods ?? DEFAULT_METHODS;
	const endpoints = options?.endpoints ?? [url];
	const findings: SecurityFinding[] = [];

	for (const endpoint of endpoints) {
		for (const method of methods) {
			const endpointFindings = await checkEndpointAuth(request, endpoint, method);
			findings.push(...endpointFindings);
		}
	}

	return findings;
}
