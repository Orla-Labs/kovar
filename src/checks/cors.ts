import type { APIRequestContext } from "@playwright/test";
import type { SecurityFinding } from "../types/results.js";

export interface CORSCheckOptions {
	url?: string;
	trustedOrigins?: string[];
	dangerousOrigins?: string[];
}

const DEFAULT_DANGEROUS_ORIGINS = ["null", "http://evil.com"];

const DANGEROUS_METHODS = ["PUT", "DELETE", "PATCH"];

interface CORSResponseHeaders {
	acao: string | null;
	acac: string | null;
	acam: string | null;
	acah: string | null;
}

async function sendOriginRequest(
	request: APIRequestContext,
	url: string,
	origin: string,
	method: "OPTIONS" | "GET",
): Promise<CORSResponseHeaders> {
	const headers: Record<string, string> = { origin };
	if (method === "OPTIONS") headers["access-control-request-method"] = "POST";
	const response = await request.fetch(url, { method, headers, maxRedirects: 0 });
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(response.headers())) {
		normalized[key.toLowerCase()] = value;
	}
	return {
		acao: normalized["access-control-allow-origin"] ?? null,
		acac: normalized["access-control-allow-credentials"] ?? null,
		acam: normalized["access-control-allow-methods"] ?? null,
		acah: normalized["access-control-allow-headers"] ?? null,
	};
}

/**
 * Origins that defeat common broken allowlists for the target's own host:
 * substring/startsWith checks ("app.example.com.kovar-evil.com") and
 * endsWith/unanchored-regex checks ("kovarevilexample.com"). The endsWith
 * probe prefixes the registrable domain (last two labels), so it is never a
 * subdomain of the app's own site and a deliberate *.example.com allowlist
 * is not flagged.
 */
function deriveBypassOrigins(targetUrl: string): string[] {
	try {
		const u = new URL(targetUrl);
		const port = u.port ? `:${u.port}` : "";
		const site = u.hostname.split(".").slice(-2).join(".");
		return [
			`${u.protocol}//${u.hostname}.kovar-evil.com${port}`,
			`${u.protocol}//kovarevil${site}${port}`,
		];
	} catch {
		return [];
	}
}

function checkReflectedOrigin(
	origin: string,
	acao: string | null,
	acac: string | null,
	url: string,
): SecurityFinding | null {
	if (!acao || acao !== origin) return null;
	const severity = acac?.toLowerCase() === "true" ? "critical" : "high";
	return {
		id: "cors-reflected-origin",
		category: "access-control",
		severity,
		message: `CORS reflects untrusted origin "${origin}"${acac?.toLowerCase() === "true" ? " with credentials allowed" : ""} — allows cross-origin attacks`,
		remediation:
			"Do not reflect arbitrary Origin values. Use a strict allowlist of trusted origins.",
		url,
		cweId: "CWE-346",
	};
}

function checkWildcardOrigin(
	acao: string | null,
	acac: string | null,
	url: string,
): SecurityFinding | null {
	if (acao !== "*") return null;
	if (acac?.toLowerCase() === "true") {
		return {
			id: "cors-wildcard-with-credentials",
			category: "access-control",
			severity: "critical",
			message:
				"CORS allows all origins (wildcard) with credentials — browsers block this, but it signals misconfiguration",
			remediation:
				"Never combine Access-Control-Allow-Origin: * with Access-Control-Allow-Credentials: true. Use specific origins.",
			url,
			cweId: "CWE-942",
		};
	}
	return {
		id: "cors-wildcard-origin",
		category: "access-control",
		severity: "high",
		message: "CORS allows all origins (Access-Control-Allow-Origin: *)",
		remediation:
			"Restrict Access-Control-Allow-Origin to specific trusted origins instead of using a wildcard",
		url,
		cweId: "CWE-942",
	};
}

function checkAllowHeaders(acah: string | null, url: string): SecurityFinding | null {
	if (!acah) return null;
	const normalized = acah.toLowerCase().trim();
	if (normalized === "*") {
		return {
			id: "cors-permissive-headers",
			category: "access-control",
			severity: "high",
			message: "CORS allows any request headers (Access-Control-Allow-Headers: *)",
			remediation:
				"Restrict Access-Control-Allow-Headers to only the headers your API needs (e.g., Content-Type, Authorization)",
			url,
			cweId: "CWE-942",
		};
	}
	return null;
}

function checkOverlyPermissiveMethods(acam: string | null, url: string): SecurityFinding | null {
	if (!acam) return null;
	const methods = acam.split(",").map((m) => m.trim().toUpperCase());
	const dangerous = methods.filter((m) => DANGEROUS_METHODS.includes(m));
	if (dangerous.length === 0) return null;
	return {
		id: "cors-permissive-methods",
		category: "access-control",
		severity: "medium",
		message: `CORS allows dangerous HTTP methods: ${dangerous.join(", ")}`,
		remediation:
			"Restrict Access-Control-Allow-Methods to only the HTTP methods your API actually needs",
		url,
		cweId: "CWE-942",
	};
}

interface ProbeState {
	checkedWildcard: boolean;
	checkedPreflight: boolean;
	attempts: number;
	errors: string[];
}

function analyzeProbe(
	origin: string,
	method: "OPTIONS" | "GET",
	res: CORSResponseHeaders,
	targetUrl: string,
	state: ProbeState,
	findings: SecurityFinding[],
): boolean {
	const reflected = checkReflectedOrigin(origin, res.acao, res.acac, targetUrl);
	if (reflected) {
		findings.push(reflected);
		return true;
	}
	if (!state.checkedWildcard && res.acao !== null) {
		const wildcard = checkWildcardOrigin(res.acao, res.acac, targetUrl);
		if (wildcard) findings.push(wildcard);
		state.checkedWildcard = true;
	}
	if (!state.checkedPreflight && method === "OPTIONS") {
		const methods = checkOverlyPermissiveMethods(res.acam, targetUrl);
		if (methods) findings.push(methods);
		const headers = checkAllowHeaders(res.acah, targetUrl);
		if (headers) findings.push(headers);
		state.checkedPreflight = true;
	}
	return false;
}

export async function checkCORS(
	request: APIRequestContext,
	url: string,
	options?: CORSCheckOptions,
): Promise<SecurityFinding[]> {
	const targetUrl = options?.url ?? url;
	const trusted = new Set(options?.trustedOrigins ?? []);
	const dangerousOrigins = (
		options?.dangerousOrigins ?? [...DEFAULT_DANGEROUS_ORIGINS, ...deriveBypassOrigins(targetUrl)]
	).filter((o) => !trusted.has(o));
	const findings: SecurityFinding[] = [];
	const state: ProbeState = {
		checkedWildcard: false,
		checkedPreflight: false,
		attempts: 0,
		errors: [],
	};

	for (const origin of dangerousOrigins) {
		// Probe both the preflight and the actual request: many apps only set
		// CORS headers on one of them (e.g. no OPTIONS handler at all).
		for (const method of ["OPTIONS", "GET"] as const) {
			state.attempts++;
			try {
				const res = await sendOriginRequest(request, targetUrl, origin, method);
				if (analyzeProbe(origin, method, res, targetUrl, state, findings)) break;
			} catch (error: unknown) {
				state.errors.push(error instanceof Error ? error.message : String(error));
			}
		}
	}

	if (state.attempts > 0 && state.errors.length === state.attempts) {
		findings.push({
			id: "cors-check-error",
			category: "access-control",
			severity: "high",
			message: `CORS could not be checked for ${targetUrl}: ${state.errors[0]}`,
			remediation:
				"Kovar could not reach the endpoint, so CORS was NOT verified. Make sure the server is running and the URL is correct.",
			url: targetUrl,
		});
	}

	return findings;
}
