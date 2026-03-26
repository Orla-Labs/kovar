import { describe, expect, it } from "vitest";
import { generateRemediation } from "../../../src/remediation/index.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function makeHeaderFinding(id: string): SecurityFinding {
	return {
		id,
		category: "headers",
		severity: "high",
		message: `${id} issue`,
		remediation: `Fix ${id}`,
	};
}

function makeCookieFinding(id: string): SecurityFinding {
	return {
		id,
		category: "cookies",
		severity: "high",
		cookie: "session",
		message: `${id} issue`,
		remediation: `Fix ${id}`,
	};
}

function makeXSSFinding(): SecurityFinding {
	return {
		id: "xss-reflected",
		category: "xss",
		severity: "critical",
		message: "XSS reflected",
		remediation: "Sanitize input",
		url: "http://localhost/search",
	};
}

function makeCSRFFinding(id: string): SecurityFinding {
	return {
		id,
		category: "access-control",
		severity: "critical",
		message: `${id} issue`,
		remediation: `Fix ${id}`,
		url: "http://localhost/api",
	};
}

function makeCORSFinding(id: string): SecurityFinding {
	return {
		id,
		category: "access-control",
		severity: "high",
		message: `${id} issue`,
		remediation: `Fix ${id}`,
		url: "http://localhost/api",
	};
}

function makeAuthFinding(id: string): SecurityFinding {
	return {
		id,
		category: "authentication",
		severity: "critical",
		message: `${id} issue`,
		remediation: `Fix ${id}`,
		url: "http://localhost/api",
	};
}

describe("generateRemediation", () => {
	it("returns correct findings count", () => {
		const findings = [
			makeHeaderFinding("header-missing-hsts"),
			makeCookieFinding("cookie-missing-secure"),
		];
		const report = generateRemediation(findings);
		expect(report.findings).toBe(2);
	});

	it("generates suggestions for both header and cookie findings", () => {
		const findings = [
			makeHeaderFinding("header-missing-hsts"),
			makeHeaderFinding("header-missing-csp"),
			makeCookieFinding("cookie-missing-secure"),
			makeCookieFinding("cookie-missing-httponly"),
		];
		const report = generateRemediation(findings);
		expect(report.suggestions).toHaveLength(4);
		expect(report.unsupported).toHaveLength(0);
	});

	it("generates suggestions for XSS findings", () => {
		const findings = [makeXSSFinding()];
		const report = generateRemediation(findings);
		expect(report.suggestions).toHaveLength(1);
		expect(report.suggestions[0]!.findingId).toBe("xss-reflected");
		expect(report.unsupported).not.toContain("xss-reflected");
	});

	it("tracks findings from unsupported categories", () => {
		const findings: SecurityFinding[] = [
			{
				id: "auth-weak-password",
				category: "authentication",
				severity: "high",
				message: "Weak password policy",
				remediation: "Enforce stronger passwords",
			},
		];
		const report = generateRemediation(findings);
		expect(report.suggestions).toHaveLength(0);
		expect(report.unsupported).toContain("auth-weak-password");
	});

	it("uses generic framework by default", () => {
		const findings = [makeHeaderFinding("header-missing-hsts")];
		const report = generateRemediation(findings);
		expect(report.suggestions[0]!.framework).toBe("generic");
	});

	it("respects framework option", () => {
		const findings = [makeHeaderFinding("header-missing-hsts")];
		const report = generateRemediation(findings, { framework: "express" });
		expect(report.suggestions[0]!.framework).toBe("express");
		expect(report.suggestions[0]!.code).toContain("res.set(");
	});

	it("respects language option", () => {
		const findings = [makeHeaderFinding("header-missing-hsts")];
		const report = generateRemediation(findings, { language: "javascript" });
		expect(report.suggestions[0]!.language).toBe("javascript");
	});

	it("defaults to typescript language", () => {
		const findings = [makeHeaderFinding("header-missing-hsts")];
		const report = generateRemediation(findings);
		expect(report.suggestions[0]!.language).toBe("typescript");
	});

	it("handles empty findings array", () => {
		const report = generateRemediation([]);
		expect(report.findings).toBe(0);
		expect(report.suggestions).toHaveLength(0);
		expect(report.unsupported).toHaveLength(0);
	});

	it("handles mixed supported and unsupported findings", () => {
		const findings = [
			makeHeaderFinding("header-missing-hsts"),
			makeXSSFinding(),
			makeCookieFinding("cookie-missing-secure"),
			makeCookieFinding("cookie-invalid-host-prefix"),
		];
		const report = generateRemediation(findings, { framework: "express" });
		expect(report.findings).toBe(4);
		expect(report.suggestions).toHaveLength(4);
		expect(report.unsupported).not.toContain("xss-reflected");
		expect(report.unsupported).not.toContain("cookie-invalid-host-prefix");
	});

	it("preserves findingId linking back to original finding", () => {
		const findings = [
			makeHeaderFinding("header-missing-hsts"),
			makeCookieFinding("cookie-missing-secure"),
		];
		const report = generateRemediation(findings, { framework: "fastify" });
		const ids = report.suggestions.map((s) => s.findingId);
		expect(ids).toContain("header-missing-hsts");
		expect(ids).toContain("cookie-missing-secure");
	});

	it("includes references on all suggestions", () => {
		const findings = [
			makeHeaderFinding("header-missing-hsts"),
			makeCookieFinding("cookie-missing-secure"),
		];
		const report = generateRemediation(findings, { framework: "express" });
		for (const suggestion of report.suggestions) {
			expect(suggestion.references.length).toBeGreaterThan(0);
			for (const ref of suggestion.references) {
				expect(ref).toMatch(/^https:\/\//);
			}
		}
	});

	it("generates suggestions for CSRF findings", () => {
		const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
		const report = generateRemediation(findings, { framework: "express" });
		expect(report.suggestions).toHaveLength(1);
		expect(report.suggestions[0]!.findingId).toBe("csrf-unprotected-endpoint");
		expect(report.unsupported).toHaveLength(0);
	});

	it("generates suggestions for CORS findings", () => {
		const findings = [makeCORSFinding("cors-reflected-origin")];
		const report = generateRemediation(findings, { framework: "express" });
		expect(report.suggestions).toHaveLength(1);
		expect(report.suggestions[0]!.findingId).toBe("cors-reflected-origin");
		expect(report.unsupported).toHaveLength(0);
	});

	it("generates suggestions for auth findings", () => {
		const findings = [makeAuthFinding("auth-missing-authentication")];
		const report = generateRemediation(findings, { framework: "express" });
		expect(report.suggestions).toHaveLength(1);
		expect(report.suggestions[0]!.findingId).toBe("auth-missing-authentication");
		expect(report.unsupported).toHaveLength(0);
	});

	it("handles mixed findings across all categories", () => {
		const findings: SecurityFinding[] = [
			makeHeaderFinding("header-missing-hsts"),
			makeCookieFinding("cookie-missing-secure"),
			makeXSSFinding(),
			makeCSRFFinding("csrf-unprotected-endpoint"),
			makeCORSFinding("cors-reflected-origin"),
			makeAuthFinding("auth-missing-authentication"),
		];
		const report = generateRemediation(findings, { framework: "express" });
		expect(report.findings).toBe(6);
		expect(report.suggestions).toHaveLength(6);
		expect(report.unsupported).toHaveLength(0);
		const ids = report.suggestions.map((s) => s.findingId);
		expect(ids).toContain("header-missing-hsts");
		expect(ids).toContain("cookie-missing-secure");
		expect(ids).toContain("xss-reflected");
		expect(ids).toContain("csrf-unprotected-endpoint");
		expect(ids).toContain("cors-reflected-origin");
		expect(ids).toContain("auth-missing-authentication");
	});

	it("tracks truly unsupported findings from unknown categories", () => {
		const findings: SecurityFinding[] = [
			{
				id: "crypto-weak-cipher",
				category: "cryptography",
				severity: "high",
				message: "Weak cipher",
				remediation: "Use stronger cipher",
			},
		];
		const report = generateRemediation(findings);
		expect(report.suggestions).toHaveLength(0);
		expect(report.unsupported).toContain("crypto-weak-cipher");
	});

	it("end-to-end: all header + cookie findings produce valid report for every framework", () => {
		const headerIds = [
			"header-missing-hsts",
			"header-missing-csp",
			"header-missing-xcto",
			"header-missing-xfo",
			"header-missing-referrer-policy",
			"header-missing-permissions-policy",
			"header-missing-coop",
			"header-missing-corp",
			"header-missing-coep",
			"header-deprecated-xxp",
			"header-remove-x-powered-by",
			"header-remove-server",
		];
		const cookieIds = [
			"cookie-missing-secure",
			"cookie-missing-httponly",
			"cookie-samesite-none",
			"cookie-excessive-expiry",
			"cookie-broad-path",
		];

		const findings = [...headerIds.map(makeHeaderFinding), ...cookieIds.map(makeCookieFinding)];

		const frameworks = ["express", "fastify", "next", "koa", "hono", "generic"] as const;
		for (const framework of frameworks) {
			const report = generateRemediation(findings, { framework });
			expect(report.findings).toBe(headerIds.length + cookieIds.length);
			expect(report.suggestions).toHaveLength(headerIds.length + cookieIds.length);
			expect(report.unsupported).toHaveLength(0);
		}
	});
});
