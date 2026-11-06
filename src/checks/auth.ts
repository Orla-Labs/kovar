import type { APIRequestContext, request as playwrightRequest } from "@playwright/test";
import type { SecurityFinding } from "../types/results.js";
import { rejectRemovedOptions } from "../utils/removed-options.js";

export interface AuthCheckOptions {
	endpoints?: string[];
	methods?: ("GET" | "POST" | "PUT" | "DELETE")[];
	/**
	 * Base URL for relative endpoints. Defaults to the current Playwright project's
	 * `use.baseURL` when called inside a test.
	 */
	baseURL?: string;
}

type NewContextOptions = NonNullable<Parameters<typeof playwrightRequest.newContext>[0]>;

interface IsolatedContext {
	request: APIRequestContext;
	dispose: () => Promise<void>;
}

/**
 * The auth check must send requests WITHOUT the caller's credentials. Playwright's
 * `request` fixture inherits `use.storageState`, `extraHTTPHeaders` and `httpCredentials`,
 * so with a standard global auth-setup project every protected endpoint would look
 * unprotected (R1-A3). Always probe from a fresh context that carries none of them.
 *
 * Inside a test worker, Playwright also fills in every `request.newContext()` option
 * whose key is ABSENT from the project's `use` (including `storageState`). The
 * credential-bearing keys are therefore set explicitly, not just omitted.
 */
async function createIsolatedContext(options?: AuthCheckOptions): Promise<IsolatedContext> {
	const pw = await import("@playwright/test");
	let use: NewContextOptions = {};
	try {
		use = pw.test.info().project.use as NewContextOptions;
	} catch {
		// Not inside a Playwright test (e.g. a plain script); use the options only.
	}
	const contextOptions = {
		storageState: { cookies: [], origins: [] },
		extraHTTPHeaders: {},
		httpCredentials: undefined,
		clientCertificates: undefined,
	} as unknown as NewContextOptions;
	const baseURL = options?.baseURL ?? use.baseURL;
	if (baseURL !== undefined) contextOptions.baseURL = baseURL;
	if (use.ignoreHTTPSErrors !== undefined) contextOptions.ignoreHTTPSErrors = use.ignoreHTTPSErrors;
	if (use.proxy !== undefined) contextOptions.proxy = use.proxy;
	const context = await pw.request.newContext(contextOptions);
	return { request: context, dispose: () => context.dispose() };
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
			maxRedirects: 0,
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
	} catch (error: unknown) {
		findings.push({
			id: "auth-check-error",
			category: "authentication",
			severity: "high",
			message: `${method} ${url} could not be checked: ${error instanceof Error ? error.message : String(error)}`,
			remediation:
				"Kovar could not reach the endpoint, so authentication was NOT verified. Make sure the server is running and the URL is correct.",
			url,
		});
	}

	return findings;
}

/**
 * Checks that each endpoint rejects unauthenticated requests.
 *
 * `_request` is accepted for API compatibility and is NOT used to send the probes:
 * the check always runs in an isolated request context with no cookies, storage
 * state, extra headers or HTTP credentials, so a logged-in `request` fixture cannot
 * make a protected endpoint look unprotected.
 */
export async function checkAuth(
	_request: APIRequestContext,
	url: string,
	options?: AuthCheckOptions,
): Promise<SecurityFinding[]> {
	rejectRemovedOptions("auth", options, ["expectedStatus"]);
	const methods = options?.methods ?? DEFAULT_METHODS;
	const endpoints = options?.endpoints ?? [url];
	const findings: SecurityFinding[] = [];

	let isolated: IsolatedContext;
	try {
		isolated = await createIsolatedContext(options);
	} catch (error: unknown) {
		return [
			{
				id: "auth-check-error",
				category: "authentication",
				severity: "high",
				message: `Could not create an isolated request context for the auth check: ${error instanceof Error ? error.message : String(error)}`,
				remediation:
					"Kovar could not send unauthenticated requests, so authentication was NOT verified. Make sure @playwright/test is installed.",
				url,
			},
		];
	}

	try {
		for (const endpoint of endpoints) {
			for (const method of methods) {
				const endpointFindings = await checkEndpointAuth(isolated.request, endpoint, method);
				findings.push(...endpointFindings);
			}
		}
	} finally {
		await isolated.dispose().catch(() => {});
	}

	return findings;
}
