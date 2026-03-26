import type { SecurityFinding } from "../types/results.js";
import { getCookieConfigFn } from "./frameworks.js";
import type { Framework, RemediationSuggestion } from "./types.js";

interface CookieRemediation {
	description: string;
	cookieOptions: {
		secure?: boolean;
		httpOnly?: boolean;
		sameSite?: string;
		maxAge?: string;
		path?: string;
	};
	references: string[];
	confidence: RemediationSuggestion["confidence"];
}

const COOKIE_REMEDIATIONS: Record<string, CookieRemediation> = {
	"cookie-missing-secure": {
		description: "Set the Secure flag to ensure cookies are only sent over HTTPS",
		cookieOptions: { secure: true },
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies",
		],
		confidence: "high",
	},
	"cookie-missing-httponly": {
		description: "Set the HttpOnly flag to prevent JavaScript access to session cookies",
		cookieOptions: { httpOnly: true },
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies",
		],
		confidence: "high",
	},
	"cookie-samesite-none": {
		description: "Set SameSite to Lax or Strict to protect against CSRF attacks",
		cookieOptions: { sameSite: "lax" },
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitesamesite-value",
		],
		confidence: "high",
	},
	"cookie-excessive-expiry": {
		description: "Reduce cookie expiration to limit session hijacking window",
		cookieOptions: { maxAge: "86400" },
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#session-expiration",
		],
		confidence: "medium",
	},
	"cookie-broad-path": {
		description: "Restrict cookie path to the minimum scope needed",
		cookieOptions: { path: "/app" },
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html",
		],
		confidence: "low",
	},
	"cookie-invalid-host-prefix": {
		description: "__Host- cookies must have Secure flag, Path=/, and no Domain attribute",
		cookieOptions: { secure: true, path: "/" },
		references: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#cookie_prefixes"],
		confidence: "high" as const,
	},
	"cookie-invalid-secure-prefix": {
		description: "__Secure- cookies must have the Secure flag",
		cookieOptions: { secure: true },
		references: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#cookie_prefixes"],
		confidence: "high" as const,
	},
};

export function remediateCookies(
	findings: SecurityFinding[],
	framework: Framework,
	language: "typescript" | "javascript",
): { suggestions: RemediationSuggestion[]; unsupported: string[] } {
	const configFn = getCookieConfigFn(framework);
	const suggestions: RemediationSuggestion[] = [];
	const unsupported: string[] = [];

	for (const finding of findings) {
		if (finding.category !== "cookies") continue;

		const remediation = COOKIE_REMEDIATIONS[finding.id];
		if (!remediation) {
			unsupported.push(finding.id);
			continue;
		}

		const cookieName = finding.cookie || undefined;
		suggestions.push({
			findingId: finding.id,
			framework,
			description: remediation.description,
			code: configFn(remediation.cookieOptions, cookieName),
			language,
			confidence: remediation.confidence,
			references: remediation.references,
		});
	}

	return { suggestions, unsupported };
}
