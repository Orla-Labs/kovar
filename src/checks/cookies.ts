import type { Cookie } from "@playwright/test";
import type { CookieCheckOptions, SecurityFinding } from "../types/index.js";

export interface CookieInput {
	name: string;
	value: string;
	domain: string;
	path: string;
	expires: number;
	httpOnly: boolean;
	secure: boolean;
	sameSite: "Strict" | "Lax" | "None";
}

const DEFAULT_SESSION_PATTERNS = [
	/\bsess(ion)?/i,
	/\bauth/i,
	/\bcsrf/i,
	/\bjwt\b/i,
	/(?:^|[_-])sid(?:$|[_-])/i,
	/\blogin/i,
	/^PHPSESSID$/i,
	/^JSESSIONID$/i,
	/^ASPSESSIONID/i,
	/^connect\.sid$/i,
	/[_-]token$/i,
];

const MAX_EXPIRY_DAYS = 365;

function isSessionCookie(name: string, patterns: RegExp[]): boolean {
	return patterns.some((p) => p.test(name));
}

function daysBetween(expiresEpoch: number): number {
	if (expiresEpoch === -1) return 0;
	const now = Date.now() / 1000;
	return Math.round((expiresEpoch - now) / 86400);
}

export function mapPlaywrightCookies(rawCookies: Cookie[]): CookieInput[] {
	return rawCookies.map((c) => ({
		name: c.name,
		value: c.value,
		domain: c.domain || "",
		path: c.path,
		expires: c.expires,
		httpOnly: c.httpOnly,
		secure: c.secure,
		sameSite: (c.sameSite || "Lax") as CookieInput["sameSite"],
	}));
}

function checkSecureFlag(cookie: CookieInput, isSession: boolean): SecurityFinding | null {
	if (cookie.secure) return null;
	return {
		id: "cookie-missing-secure",
		category: "cookies",
		severity: isSession ? "critical" : "medium",
		cookie: cookie.name,
		message: `Cookie "${cookie.name}" is missing the Secure flag`,
		remediation: `Set the Secure flag: cookie("${cookie.name}", value, { secure: true })`,
	};
}

function checkHttpOnly(cookie: CookieInput, isSession: boolean): SecurityFinding | null {
	if (!isSession || cookie.httpOnly) return null;
	return {
		id: "cookie-missing-httponly",
		category: "cookies",
		severity: "critical",
		cookie: cookie.name,
		message: `Session cookie "${cookie.name}" is missing the HttpOnly flag — accessible to JavaScript`,
		remediation: `Set the HttpOnly flag: cookie("${cookie.name}", value, { httpOnly: true })`,
	};
}

function checkSameSite(
	cookie: CookieInput,
	isSession: boolean,
	allowSameSiteNone: Set<string>,
): SecurityFinding | null {
	if (cookie.sameSite !== "None" || allowSameSiteNone.has(cookie.name)) return null;
	return {
		id: "cookie-samesite-none",
		category: "cookies",
		severity: isSession ? "high" : "medium",
		cookie: cookie.name,
		message: `Cookie "${cookie.name}" has SameSite=None, enabling cross-site requests`,
		remediation: `Set SameSite to Strict or Lax: cookie("${cookie.name}", value, { sameSite: "strict" })`,
	};
}

function checkExpiry(
	cookie: CookieInput,
	isSession: boolean,
	maxExpiry: number,
): SecurityFinding | null {
	if (!isSession || cookie.expires === -1) return null;
	const days = daysBetween(cookie.expires);
	if (days <= maxExpiry) return null;
	return {
		id: "cookie-excessive-expiry",
		category: "cookies",
		severity: "medium",
		cookie: cookie.name,
		message: `Session cookie "${cookie.name}" expires in ${days} days (max recommended: ${maxExpiry})`,
		remediation: "Reduce cookie expiration or use session cookies (no explicit expiry)",
	};
}

function checkBroadPath(cookie: CookieInput, isSession: boolean): SecurityFinding | null {
	if (!isSession || cookie.path !== "/") return null;
	return {
		id: "cookie-broad-path",
		category: "cookies",
		severity: "low",
		cookie: cookie.name,
		message: `Session cookie "${cookie.name}" has path="/", making it available to all routes`,
		remediation: "Restrict the cookie path to the minimum scope needed",
	};
}

function checkHostPrefix(cookie: CookieInput): SecurityFinding | null {
	if (!cookie.name.startsWith("__Host-")) return null;
	const domainSet = cookie.domain !== "" && cookie.domain !== undefined;
	if (cookie.secure && cookie.path === "/" && !domainSet) return null;
	return {
		id: "cookie-invalid-host-prefix",
		category: "cookies",
		severity: "high",
		cookie: cookie.name,
		message: `Cookie "${cookie.name}" uses __Host- prefix but violates its requirements (must be Secure, path=/, no Domain)`,
		remediation: "__Host- cookies must have Secure flag, path=/, and no Domain attribute",
	};
}

function checkSecurePrefix(cookie: CookieInput): SecurityFinding | null {
	if (!cookie.name.startsWith("__Secure-") || cookie.secure) return null;
	return {
		id: "cookie-invalid-secure-prefix",
		category: "cookies",
		severity: "high",
		cookie: cookie.name,
		message: `Cookie "${cookie.name}" uses __Secure- prefix but is missing the Secure flag`,
		remediation: "__Secure- cookies must have the Secure flag set",
	};
}

export function analyzeCookies(
	cookies: CookieInput[],
	options?: CookieCheckOptions,
): SecurityFinding[] {
	const skip = new Set(options?.skip);
	const sessionPatterns = [...DEFAULT_SESSION_PATTERNS, ...(options?.sessionCookiePatterns ?? [])];
	const maxExpiry = options?.maxExpiryDays ?? MAX_EXPIRY_DAYS;
	const allowSameSiteNone = new Set(options?.allowSameSiteNone);
	const findings: SecurityFinding[] = [];

	for (const cookie of cookies) {
		if (skip.has(cookie.name)) continue;
		const isSession = isSessionCookie(cookie.name, sessionPatterns);

		const checks = [
			checkSecureFlag(cookie, isSession),
			checkHttpOnly(cookie, isSession),
			checkSameSite(cookie, isSession, allowSameSiteNone),
			checkExpiry(cookie, isSession, maxExpiry),
			checkBroadPath(cookie, isSession),
			checkHostPrefix(cookie),
			checkSecurePrefix(cookie),
		];

		for (const finding of checks) {
			if (finding) findings.push(finding);
		}
	}

	return findings;
}
