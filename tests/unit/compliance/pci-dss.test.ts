import { describe, expect, it } from "vitest";
import { evaluatePCIDSS } from "../../../src/compliance/pci-dss.js";
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

describe("evaluatePCIDSS", () => {
	it("returns all pass when no findings exist (all requirements have kovarCheckIds)", () => {
		const report = evaluatePCIDSS([]);
		expect(report.standard).toBe("PCI-DSS");
		expect(report.version).toBe("4.0");
		expect(report.summary.failed).toBe(0);
		expect(report.summary.notTested).toBe(0);
		expect(report.summary.passed).toBe(report.summary.total);
	});

	it("marks 6.2.4 as fail for XSS findings", () => {
		const findings = [finding({ id: "xss-basic-script", category: "xss", severity: "critical" })];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "6.2.4");
		expect(req!.status).toBe("fail");
		expect(req!.findings).toHaveLength(1);
	});

	it("marks 6.4.1 as fail for missing security headers", () => {
		const findings = [
			finding({ id: "header-missing-hsts", severity: "critical" }),
			finding({ id: "header-missing-csp", severity: "critical" }),
		];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "6.4.1");
		expect(req!.status).toBe("fail");
		expect(req!.findings).toHaveLength(2);
	});

	it("marks 6.4.1 as fail for any mapped header finding", () => {
		const findings = [finding({ id: "header-missing-referrer-policy", severity: "medium" })];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "6.4.1");
		expect(req!.status).toBe("fail");
	});

	it("marks 6.4.2 as fail for missing CSP", () => {
		const findings = [finding({ id: "header-missing-csp", severity: "critical" })];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "6.4.2");
		expect(req!.status).toBe("fail");
	});

	it("marks 4.2.1 as fail for missing HSTS", () => {
		const findings = [finding({ id: "header-missing-hsts", severity: "critical" })];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "4.2.1");
		expect(req!.status).toBe("fail");
	});

	it("marks 6.5.4 as fail for XSS findings", () => {
		const findings = [
			finding({ id: "xss-dom-img-onerror", category: "xss", severity: "critical" }),
		];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "6.5.4");
		expect(req!.status).toBe("fail");
	});

	it("marks 6.5.10 as fail for cookie security issues", () => {
		const findings = [
			finding({ id: "cookie-missing-secure", category: "cookies", severity: "critical" }),
			finding({ id: "cookie-missing-httponly", category: "cookies", severity: "critical" }),
		];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "6.5.10");
		expect(req!.status).toBe("fail");
		expect(req!.findings).toHaveLength(2);
	});

	it("maps SameSite cookie issues to 6.5.10", () => {
		const findings = [
			finding({ id: "cookie-samesite-none", category: "cookies", severity: "high" }),
		];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "6.5.10");
		expect(req!.status).toBe("fail");
	});

	it("maps excessive cookie expiry to 6.5.10", () => {
		const findings = [
			finding({ id: "cookie-excessive-expiry", category: "cookies", severity: "medium" }),
		];
		const report = evaluatePCIDSS(findings);
		const req = report.requirements.find((r) => r.id === "6.5.10");
		expect(req!.status).toBe("fail");
	});

	it("calculates summary correctly", () => {
		const findings = [finding({ id: "header-missing-hsts", severity: "critical" })];
		const report = evaluatePCIDSS(findings);
		expect(report.summary.total).toBe(6);
		expect(report.summary.failed).toBeGreaterThan(0);
		expect(report.summary.passed).toBeGreaterThan(0);
		expect(report.summary.total).toBe(
			report.summary.passed + report.summary.failed + report.summary.notTested,
		);
	});

	it("calculates 100% coverage since all requirements are testable", () => {
		const report = evaluatePCIDSS([]);
		expect(report.summary.coverage).toBe(100);
	});

	it("sets standard to pci-dss on all requirements", () => {
		const report = evaluatePCIDSS([]);
		for (const req of report.requirements) {
			expect(req.standard).toBe("pci-dss");
		}
	});

	it("includes timestamp in ISO format", () => {
		const report = evaluatePCIDSS([]);
		expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("unrelated findings do not cause failures", () => {
		const findings = [finding({ id: "header-remove-server", severity: "info" })];
		const report = evaluatePCIDSS(findings);
		expect(report.summary.failed).toBe(0);
	});

	it("handles multiple XSS findings across requirements", () => {
		const findings = [
			finding({ id: "xss-basic-script", category: "xss", severity: "critical" }),
			finding({ id: "xss-dom-svg", category: "xss", severity: "critical" }),
		];
		const report = evaluatePCIDSS(findings);
		const req624 = report.requirements.find((r) => r.id === "6.2.4");
		const req654 = report.requirements.find((r) => r.id === "6.5.4");
		expect(req624!.findings).toHaveLength(2);
		expect(req654!.findings).toHaveLength(2);
	});

	it("does not include level property on requirements", () => {
		const report = evaluatePCIDSS([]);
		for (const req of report.requirements) {
			expect(req.level).toBeUndefined();
		}
	});

	it("summary.notTested reflects count of not-tested requirements", () => {
		const report = evaluatePCIDSS([]);
		const notTestedCount = report.requirements.filter((r) => r.status === "not-tested").length;
		expect(report.summary.notTested).toBe(notTestedCount);
	});

	it("total equals passed + failed + notTested", () => {
		const findings = [finding({ id: "header-missing-hsts", severity: "critical" })];
		const report = evaluatePCIDSS(findings);
		expect(report.summary.total).toBe(
			report.summary.passed + report.summary.failed + report.summary.notTested,
		);
	});
});
