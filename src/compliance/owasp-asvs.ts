import type { SecurityFinding } from "../types/results.js";
import type { ComplianceReport, ComplianceRequirement } from "./types.js";

interface ASVSRequirementDef {
	id: string;
	title: string;
	description: string;
	level: 1 | 2 | 3;
	kovarCheckIds: string[];
}

const ASVS_REQUIREMENTS: ASVSRequirementDef[] = [
	{
		id: "V14.4.1",
		title: "HTTP Security Headers",
		description:
			"Verify that every HTTP response contains a Content-Type header and that HTTP security headers are present.",
		level: 1,
		kovarCheckIds: [
			"header-missing-hsts",
			"header-missing-csp",
			"header-missing-xcto",
			"header-missing-xfo",
		],
	},
	{
		id: "V14.4.3",
		title: "CSP Policy",
		description:
			"Verify that the Content-Security-Policy response header is present and not overly permissive.",
		level: 1,
		kovarCheckIds: ["header-missing-csp"],
	},
	{
		id: "V14.4.5",
		title: "X-Content-Type-Options",
		description:
			"Verify that X-Content-Type-Options: nosniff is set to prevent MIME-sniffing attacks.",
		level: 1,
		kovarCheckIds: ["header-missing-xcto"],
	},
	{
		id: "V14.4.6",
		title: "Referrer-Policy",
		description: "Verify that Referrer-Policy is set and does not leak full URLs via unsafe-url.",
		level: 1,
		kovarCheckIds: ["header-missing-referrer-policy"],
	},
	{
		id: "V14.4.7",
		title: "X-Frame-Options",
		description:
			"Verify that X-Frame-Options is set to DENY or SAMEORIGIN to prevent clickjacking.",
		level: 1,
		kovarCheckIds: ["header-missing-xfo"],
	},
	{
		id: "V3.4.1",
		title: "Cookie Secure Flag",
		description: "Verify that cookie-based session tokens have the Secure attribute set.",
		level: 1,
		kovarCheckIds: ["cookie-missing-secure"],
	},
	{
		id: "V3.4.2",
		title: "Cookie HttpOnly Flag",
		description: "Verify that cookie-based session tokens have the HttpOnly attribute set.",
		level: 1,
		kovarCheckIds: ["cookie-missing-httponly"],
	},
	{
		id: "V3.4.3",
		title: "Cookie SameSite",
		description:
			"Verify that cookie-based session tokens use the SameSite attribute to limit CSRF exposure.",
		level: 1,
		kovarCheckIds: ["cookie-samesite-none"],
	},
	{
		id: "V3.4.4",
		title: "Cookie Prefix",
		description: "Verify that cookie-based session tokens use __Host- or __Secure- prefix.",
		level: 1,
		kovarCheckIds: ["cookie-invalid-host-prefix", "cookie-invalid-secure-prefix"],
	},
	{
		id: "V5.3.3",
		title: "Reflected XSS Protection",
		description: "Verify that the application is protected against reflected XSS attacks.",
		level: 1,
		kovarCheckIds: ["xss-"],
	},
	{
		id: "V14.5.1",
		title: "HSTS Max-Age",
		description: "Verify that Strict-Transport-Security has max-age of at least 31536000 seconds.",
		level: 2,
		kovarCheckIds: ["header-missing-hsts"],
	},
	{
		id: "V3.4.5",
		title: "Cookie Expiry",
		description:
			"Verify that session cookies have a reasonably short expiration to limit session fixation risk.",
		level: 2,
		kovarCheckIds: ["cookie-excessive-expiry"],
	},
	{
		id: "V14.4.2",
		title: "Permissions-Policy",
		description:
			"Verify that Permissions-Policy restricts access to sensitive browser features like camera and microphone.",
		level: 2,
		kovarCheckIds: ["header-missing-permissions-policy"],
	},
	{
		id: "V14.4.4",
		title: "Cross-Origin Isolation (COOP/CORP/COEP)",
		description:
			"Verify that Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, and Cross-Origin-Embedder-Policy headers are set for cross-origin isolation.",
		level: 3,
		kovarCheckIds: ["header-missing-coop", "header-missing-corp", "header-missing-coep"],
	},
];

function matchesFinding(checkId: string, finding: SecurityFinding): boolean {
	if (checkId.endsWith("-")) {
		return finding.id.startsWith(checkId);
	}
	return finding.id === checkId;
}

function evaluateRequirement(
	def: ASVSRequirementDef,
	findings: SecurityFinding[],
): ComplianceRequirement {
	const matched = findings.filter((f) =>
		def.kovarCheckIds.some((checkId) => matchesFinding(checkId, f)),
	);

	let status: ComplianceRequirement["status"];
	if (matched.length > 0) {
		status = "fail";
	} else if (def.kovarCheckIds.length === 0) {
		status = "not-tested";
	} else {
		status = "pass";
	}

	return {
		id: def.id,
		standard: "owasp-asvs",
		title: def.title,
		description: def.description,
		level: def.level,
		kovarCheckIds: def.kovarCheckIds,
		status,
		findings: matched,
	};
}

export function evaluateASVS(
	findings: SecurityFinding[],
	options?: { level?: 1 | 2 | 3 },
): ComplianceReport {
	const level = options?.level ?? 1;
	const filtered = ASVS_REQUIREMENTS.filter((r) => r.level <= level);
	const requirements = filtered.map((def) => evaluateRequirement(def, findings));

	const passed = requirements.filter((r) => r.status === "pass").length;
	const failed = requirements.filter((r) => r.status === "fail").length;
	const notTested = requirements.filter((r) => r.status === "not-tested").length;
	const total = requirements.length;
	const coverage = total > 0 ? Math.round(((passed + failed) / total) * 100) : 0;

	return {
		standard: "OWASP ASVS",
		version: "4.0.3",
		timestamp: new Date().toISOString(),
		summary: { total, passed, failed, notTested, coverage },
		requirements,
	};
}
