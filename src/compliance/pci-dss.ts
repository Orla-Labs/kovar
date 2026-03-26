import type { SecurityFinding } from "../types/results.js";
import type { ComplianceReport, ComplianceRequirement } from "./types.js";

interface PCIDSSRequirementDef {
	id: string;
	title: string;
	description: string;
	kovarCheckIds: string[];
}

const PCIDSS_REQUIREMENTS: PCIDSSRequirementDef[] = [
	{
		id: "6.2.4",
		title: "Software Engineering Techniques to Prevent Common Vulnerabilities",
		description:
			"Software engineering techniques or other methods are defined and in use by software development personnel to prevent or mitigate common software attacks, including XSS.",
		kovarCheckIds: ["xss-"],
	},
	{
		id: "6.4.1",
		title: "Public-Facing Web Application Protection",
		description:
			"For public-facing web applications, new threats and vulnerabilities are addressed on an ongoing basis, with HTTP security headers and CSP as defense layers.",
		kovarCheckIds: [
			"header-missing-hsts",
			"header-missing-csp",
			"header-missing-xcto",
			"header-missing-xfo",
			"header-missing-referrer-policy",
		],
	},
	{
		id: "6.4.2",
		title: "Web Application Firewall or Equivalent",
		description:
			"For public-facing web applications, an automated technical solution is deployed that continually detects and prevents web-based attacks. CSP serves as a defense layer.",
		kovarCheckIds: ["header-missing-csp"],
	},
	{
		id: "4.2.1",
		title: "Strong Cryptography for Transmission",
		description:
			"Strong cryptography is used to safeguard sensitive data during transmission over open, public networks. HSTS enforces TLS usage.",
		kovarCheckIds: ["header-missing-hsts"],
	},
	{
		id: "6.5.4",
		title: "Cross-Site Scripting (XSS)",
		description:
			"Cross-site scripting (XSS) vulnerabilities are addressed in custom application code.",
		kovarCheckIds: ["xss-"],
	},
	{
		id: "6.5.10",
		title: "Broken Authentication and Session Management",
		description:
			"Broken authentication and session management vulnerabilities are addressed, including proper cookie security flags.",
		kovarCheckIds: [
			"cookie-missing-secure",
			"cookie-missing-httponly",
			"cookie-samesite-none",
			"cookie-excessive-expiry",
		],
	},
];

function matchesFinding(checkId: string, finding: SecurityFinding): boolean {
	if (checkId.endsWith("-")) {
		return finding.id.startsWith(checkId);
	}
	return finding.id === checkId;
}

function evaluateRequirement(
	def: PCIDSSRequirementDef,
	findings: SecurityFinding[],
): ComplianceRequirement {
	const matched = findings.filter((f) =>
		def.kovarCheckIds.some((checkId) => matchesFinding(checkId, f)),
	);

	return {
		id: def.id,
		standard: "pci-dss",
		title: def.title,
		description: def.description,
		kovarCheckIds: def.kovarCheckIds,
		status: matched.length > 0 ? "fail" : def.kovarCheckIds.length === 0 ? "not-tested" : "pass",
		findings: matched,
	};
}

export function evaluatePCIDSS(findings: SecurityFinding[]): ComplianceReport {
	const requirements = PCIDSS_REQUIREMENTS.map((def) => evaluateRequirement(def, findings));

	const passed = requirements.filter((r) => r.status === "pass").length;
	const failed = requirements.filter((r) => r.status === "fail").length;
	const notTested = requirements.filter((r) => r.status === "not-tested").length;
	const total = requirements.length;
	const coverage = total > 0 ? Math.round(((passed + failed) / total) * 100) : 0;

	return {
		standard: "PCI-DSS",
		version: "4.0",
		timestamp: new Date().toISOString(),
		summary: { total, passed, failed, notTested, coverage },
		requirements,
	};
}
