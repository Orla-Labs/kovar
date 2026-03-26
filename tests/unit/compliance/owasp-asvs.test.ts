import { describe, expect, it } from "vitest";
import { evaluateASVS } from "../../../src/compliance/owasp-asvs.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function finding(overrides: Partial<SecurityFinding> & { id: string }): SecurityFinding {
	return {
		category: "headers",
		severity: "high",
		message: "test finding",
		remediation: "fix it",
		...overrides,
	};
}

describe("evaluateASVS", () => {
	it("returns all pass when no findings exist (all requirements have kovarCheckIds)", () => {
		const report = evaluateASVS([]);
		expect(report.standard).toBe("OWASP ASVS");
		expect(report.version).toBe("4.0.3");
		expect(report.summary.failed).toBe(0);
		expect(report.summary.notTested).toBe(0);
		expect(report.summary.passed).toBe(report.summary.total);
		expect(report.requirements.every((r) => r.status === "pass")).toBe(true);
	});

	it("defaults to level 1 requirements", () => {
		const report = evaluateASVS([]);
		const levels = report.requirements.map((r) => r.level);
		expect(levels.every((l) => l === 1)).toBe(true);
	});

	it("includes level 2 requirements when level is 2", () => {
		const report = evaluateASVS([], { level: 2 });
		const hasLevel2 = report.requirements.some((r) => r.level === 2);
		const hasLevel3 = report.requirements.some((r) => r.level === 3);
		expect(hasLevel2).toBe(true);
		expect(hasLevel3).toBe(false);
	});

	it("includes all levels when level is 3", () => {
		const report = evaluateASVS([], { level: 3 });
		const hasLevel1 = report.requirements.some((r) => r.level === 1);
		const hasLevel2 = report.requirements.some((r) => r.level === 2);
		const hasLevel3 = report.requirements.some((r) => r.level === 3);
		expect(hasLevel1).toBe(true);
		expect(hasLevel2).toBe(true);
		expect(hasLevel3).toBe(true);
	});

	it("marks V14.4.1 as fail when header findings exist", () => {
		const findings = [finding({ id: "header-missing-hsts", severity: "critical" })];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V14.4.1");
		expect(req).toBeDefined();
		expect(req!.status).toBe("fail");
		expect(req!.findings).toHaveLength(1);
	});

	it("maps multiple header findings to V14.4.1", () => {
		const findings = [
			finding({ id: "header-missing-hsts", severity: "critical" }),
			finding({ id: "header-missing-csp", severity: "critical" }),
			finding({ id: "header-missing-xcto", severity: "high" }),
			finding({ id: "header-missing-xfo", severity: "high" }),
		];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V14.4.1");
		expect(req!.findings).toHaveLength(4);
		expect(req!.status).toBe("fail");
	});

	it("marks V14.4.3 as fail for CSP issues", () => {
		const findings = [finding({ id: "header-missing-csp", severity: "critical" })];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V14.4.3");
		expect(req!.status).toBe("fail");
	});

	it("marks V14.4.5 as fail for missing X-Content-Type-Options", () => {
		const findings = [finding({ id: "header-missing-xcto" })];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V14.4.5");
		expect(req!.status).toBe("fail");
	});

	it("marks V14.4.6 as fail for missing Referrer-Policy", () => {
		const findings = [finding({ id: "header-missing-referrer-policy", severity: "medium" })];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V14.4.6");
		expect(req!.status).toBe("fail");
	});

	it("marks V14.4.7 as fail for missing X-Frame-Options", () => {
		const findings = [finding({ id: "header-missing-xfo" })];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V14.4.7");
		expect(req!.status).toBe("fail");
	});

	it("marks V3.4.1 as fail for missing cookie Secure flag", () => {
		const findings = [
			finding({ id: "cookie-missing-secure", category: "cookies", severity: "critical" }),
		];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V3.4.1");
		expect(req!.status).toBe("fail");
	});

	it("marks V3.4.2 as fail for missing cookie HttpOnly flag", () => {
		const findings = [
			finding({ id: "cookie-missing-httponly", category: "cookies", severity: "critical" }),
		];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V3.4.2");
		expect(req!.status).toBe("fail");
	});

	it("marks V3.4.3 as fail for SameSite=None cookie", () => {
		const findings = [
			finding({ id: "cookie-samesite-none", category: "cookies", severity: "high" }),
		];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V3.4.3");
		expect(req!.status).toBe("fail");
	});

	it("marks V3.4.4 as fail for invalid cookie prefix", () => {
		const findings = [
			finding({ id: "cookie-invalid-host-prefix", category: "cookies", severity: "high" }),
		];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V3.4.4");
		expect(req!.status).toBe("fail");
	});

	it("marks V3.4.4 as fail for invalid __Secure- prefix", () => {
		const findings = [
			finding({ id: "cookie-invalid-secure-prefix", category: "cookies", severity: "high" }),
		];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V3.4.4");
		expect(req!.status).toBe("fail");
	});

	it("marks V5.3.3 as fail for XSS findings using prefix match", () => {
		const findings = [finding({ id: "xss-basic-script", category: "xss", severity: "critical" })];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V5.3.3");
		expect(req!.status).toBe("fail");
		expect(req!.findings).toHaveLength(1);
	});

	it("matches xss-dom prefixed findings to V5.3.3", () => {
		const findings = [
			finding({ id: "xss-dom-img-onerror", category: "xss", severity: "critical" }),
		];
		const report = evaluateASVS(findings);
		const req = report.requirements.find((r) => r.id === "V5.3.3");
		expect(req!.status).toBe("fail");
	});

	it("marks level 2 requirements as fail when appropriate", () => {
		const findings = [finding({ id: "header-missing-hsts", severity: "critical" })];
		const report = evaluateASVS(findings, { level: 2 });
		const hsts = report.requirements.find((r) => r.id === "V14.5.1");
		expect(hsts).toBeDefined();
		expect(hsts!.status).toBe("fail");
	});

	it("marks V3.4.5 as fail for excessive cookie expiry at level 2", () => {
		const findings = [
			finding({ id: "cookie-excessive-expiry", category: "cookies", severity: "medium" }),
		];
		const report = evaluateASVS(findings, { level: 2 });
		const req = report.requirements.find((r) => r.id === "V3.4.5");
		expect(req!.status).toBe("fail");
	});

	it("marks V14.4.2 as fail for missing Permissions-Policy at level 2", () => {
		const findings = [finding({ id: "header-missing-permissions-policy", severity: "medium" })];
		const report = evaluateASVS(findings, { level: 2 });
		const req = report.requirements.find((r) => r.id === "V14.4.2");
		expect(req!.status).toBe("fail");
	});

	it("marks V14.4.4 as fail for missing cross-origin headers at level 3", () => {
		const findings = [
			finding({ id: "header-missing-coop", severity: "low" }),
			finding({ id: "header-missing-corp", severity: "low" }),
			finding({ id: "header-missing-coep", severity: "low" }),
		];
		const report = evaluateASVS(findings, { level: 3 });
		const req = report.requirements.find((r) => r.id === "V14.4.4");
		expect(req!.status).toBe("fail");
		expect(req!.findings).toHaveLength(3);
	});

	it("calculates summary correctly with mixed results", () => {
		const findings = [
			finding({ id: "header-missing-hsts", severity: "critical" }),
			finding({ id: "cookie-missing-secure", category: "cookies", severity: "critical" }),
		];
		const report = evaluateASVS(findings);
		expect(report.summary.failed).toBeGreaterThan(0);
		expect(report.summary.passed).toBeGreaterThan(0);
		expect(report.summary.total).toBe(
			report.summary.passed + report.summary.failed + report.summary.notTested,
		);
	});

	it("calculates coverage as 100% when all requirements have kovarCheckIds", () => {
		const report = evaluateASVS([]);
		expect(report.summary.coverage).toBe(100);
	});

	it("sets standard to owasp-asvs on all requirements", () => {
		const report = evaluateASVS([], { level: 3 });
		for (const req of report.requirements) {
			expect(req.standard).toBe("owasp-asvs");
		}
	});

	it("includes timestamp in ISO format", () => {
		const report = evaluateASVS([]);
		expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("does not include level 2 requirements at level 1", () => {
		const findings = [finding({ id: "cookie-excessive-expiry", category: "cookies" })];
		const report = evaluateASVS(findings, { level: 1 });
		const req = report.requirements.find((r) => r.id === "V3.4.5");
		expect(req).toBeUndefined();
	});

	it("unrelated findings do not affect requirement status", () => {
		const findings = [finding({ id: "header-remove-x-powered-by", severity: "low" })];
		const report = evaluateASVS(findings);
		const allPass = report.requirements.every((r) => r.status === "pass");
		expect(allPass).toBe(true);
	});

	it("summary.notTested reflects count of not-tested requirements", () => {
		const report = evaluateASVS([]);
		const notTestedCount = report.requirements.filter((r) => r.status === "not-tested").length;
		expect(report.summary.notTested).toBe(notTestedCount);
	});

	it("total equals passed + failed + notTested", () => {
		const findings = [
			finding({ id: "header-missing-hsts", severity: "critical" }),
			finding({ id: "cookie-missing-secure", category: "cookies", severity: "critical" }),
		];
		const report = evaluateASVS(findings, { level: 3 });
		expect(report.summary.total).toBe(
			report.summary.passed + report.summary.failed + report.summary.notTested,
		);
	});
});
