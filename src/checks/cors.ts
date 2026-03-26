import type { APIRequestContext } from "@playwright/test";
import type { SecurityFinding } from "../types/results.js";

export interface CORSCheckOptions {
	url?: string;
	trustedOrigins?: string[];
	dangerousOrigins?: string[];
}

const DEFAULT_DANGEROUS_ORIGINS = ["null", "http://evil.com"];

const DANGEROUS_METHODS = ["PUT", "DELETE", "PATCH"];

async function sendOriginRequest(
	request: APIRequestContext,
	url: string,
	origin: string,
): Promise<{ acao: string | null; acac: string | null; acam: string | null; acah: string | null }> {
	try {
		const response = await request.fetch(url, {
			method: "OPTIONS",
			headers: {
				origin,
				"access-control-request-method": "POST",
			},
		});
		const headers = response.headers();
		const normalized: Record<string, string> = {};
		for (const [key, value] of Object.entries(headers)) {
			normalized[key.toLowerCase()] = value;
		}
		return {
			acao: normalized["access-control-allow-origin"] ?? null,
			acac: normalized["access-control-allow-credentials"] ?? null,
			acam: normalized["access-control-allow-methods"] ?? null,
			acah: normalized["access-control-allow-headers"] ?? null,
		};
	} catch {
		return { acao: null, acac: null, acam: null, acah: null };
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

export async function checkCORS(
	request: APIRequestContext,
	url: string,
	options?: CORSCheckOptions,
): Promise<SecurityFinding[]> {
	const targetUrl = options?.url ?? url;
	const dangerousOrigins = options?.dangerousOrigins ?? DEFAULT_DANGEROUS_ORIGINS;
	const findings: SecurityFinding[] = [];

	let checkedWildcard = false;
	let checkedMethods = false;
	let checkedHeaders = false;

	for (const origin of dangerousOrigins) {
		const { acao, acac, acam, acah } = await sendOriginRequest(request, targetUrl, origin);

		const reflected = checkReflectedOrigin(origin, acao, acac, targetUrl);
		if (reflected) findings.push(reflected);

		if (!checkedWildcard) {
			const wildcard = checkWildcardOrigin(acao, acac, targetUrl);
			if (wildcard) findings.push(wildcard);
			checkedWildcard = true;
		}

		if (!checkedMethods) {
			const methods = checkOverlyPermissiveMethods(acam, targetUrl);
			if (methods) findings.push(methods);
			checkedMethods = true;
		}

		if (!checkedHeaders) {
			const headers = checkAllowHeaders(acah, targetUrl);
			if (headers) findings.push(headers);
			checkedHeaders = true;
		}
	}

	return findings;
}
