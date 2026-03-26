import { describe, expect, it } from "vitest";
import { formatComplianceReport } from "../../../src/compliance/report.js";
import type { ComplianceReport } from "../../../src/compliance/types.js";

function makeReport(overrides?: Partial<ComplianceReport>): ComplianceReport {
	return {
		standard: "OWASP ASVS",
		version: "4.0.3",
		timestamp: "2026-03-26T12:00:00.000Z",
		summary: {
			total: 3,
			passed: 1,
			failed: 1,
			notTested: 1,
			coverage: 67,
		},
		requirements: [
			{
				id: "V14.4.1",
				standard: "owasp-asvs",
				title: "HTTP Security Headers",
				description: "Verify HTTP security headers are present.",
				level: 1,
				kovarCheckIds: ["header-missing-hsts", "header-missing-csp"],
				status: "fail",
				findings: [
					{
						id: "header-missing-csp",
						category: "headers",
						severity: "critical",
						message: "Content-Security-Policy header is missing",
						remediation: "Set a Content-Security-Policy header.",
					},
					{
						id: "header-missing-hsts",
						category: "headers",
						severity: "high",
						message: "Strict-Transport-Security header is missing",
						remediation: "Set Strict-Transport-Security: max-age=63072000; includeSubDomains",
					},
				],
			},
			{
				id: "V14.4.5",
				standard: "owasp-asvs",
				title: "X-Content-Type-Options",
				description: "Verify X-Content-Type-Options: nosniff is set.",
				level: 1,
				kovarCheckIds: ["header-missing-xcto"],
				status: "pass",
				findings: [],
			},
			{
				id: "V99.1.1",
				standard: "owasp-asvs",
				title: "Auth Flows",
				description: "Verify authentication flows.",
				level: 1,
				kovarCheckIds: [],
				status: "not-tested",
				findings: [],
			},
		],
		...overrides,
	};
}

describe("formatComplianceReport", () => {
	describe("json format", () => {
		it("produces valid JSON", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "json");
			const parsed = JSON.parse(output);
			expect(parsed.standard).toBe("OWASP ASVS");
			expect(parsed.version).toBe("4.0.3");
		});

		it("includes all report fields", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "json");
			const parsed = JSON.parse(output);
			expect(parsed.summary.total).toBe(3);
			expect(parsed.requirements).toHaveLength(3);
		});

		it("preserves requirement details", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "json");
			const parsed = JSON.parse(output);
			const failed = parsed.requirements.find((r: { status: string }) => r.status === "fail");
			expect(failed.findings).toHaveLength(2);
		});
	});

	describe("markdown format", () => {
		it("starts with the report title", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output.startsWith("# OWASP ASVS 4.0.3 Compliance Report")).toBe(true);
		});

		it("includes the date", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("**Date:** 2026-03-26");
		});

		it("includes level for ASVS reports", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("**Level:** 1");
		});

		it("does not include level when no requirements have levels", () => {
			const report = makeReport({
				requirements: [
					{
						id: "6.2.4",
						standard: "pci-dss",
						title: "XSS Prevention",
						description: "Test",
						kovarCheckIds: [],
						status: "pass",
						findings: [],
					},
				],
			});
			const output = formatComplianceReport(report, "markdown");
			expect(output).not.toContain("**Level:**");
		});

		it("includes summary section with coverage", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("## Summary");
			expect(output).toContain("- Total requirements: 3");
			expect(output).toContain("- Passed: 1 (33%)");
			expect(output).toContain("- Failed: 1 (33%)");
			expect(output).toContain("- Not tested: 1 (33%)");
			expect(output).toContain("- Coverage: 67% (requirements testable by Kovar)");
		});

		it("includes failed requirements section", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("## Failed Requirements");
			expect(output).toContain("### V14.4.1 — HTTP Security Headers [FAIL]");
		});

		it("includes severity tags for findings", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("[CRITICAL]");
			expect(output).toContain("[HIGH]");
		});

		it("includes finding messages", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("Content-Security-Policy header is missing");
		});

		it("includes all unique remediations", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("**Remediations:**");
			expect(output).toContain("- Set a Content-Security-Policy header.");
			expect(output).toContain(
				"- Set Strict-Transport-Security: max-age=63072000; includeSubDomains",
			);
		});

		it("includes passed requirements section", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("## Passed Requirements");
			expect(output).toContain("V14.4.5 — X-Content-Type-Options ✓");
		});

		it("includes not tested section", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "markdown");
			expect(output).toContain("## Not Tested");
			expect(output).toContain("V99.1.1 — Auth Flows");
		});

		it("omits failed section when nothing failed", () => {
			const report = makeReport({
				summary: { total: 1, passed: 1, failed: 0, notTested: 0, coverage: 100 },
				requirements: [
					{
						id: "V14.4.5",
						standard: "owasp-asvs",
						title: "X-Content-Type-Options",
						description: "Test",
						level: 1,
						kovarCheckIds: ["header-missing-xcto"],
						status: "pass",
						findings: [],
					},
				],
			});
			const output = formatComplianceReport(report, "markdown");
			expect(output).not.toContain("## Failed Requirements");
		});
	});

	describe("text format", () => {
		it("starts with the report title without markdown", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("OWASP ASVS 4.0.3 Compliance Report");
			expect(output).not.toContain("# OWASP ASVS");
		});

		it("includes separator lines", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("=".repeat("OWASP ASVS 4.0.3 Compliance Report".length));
		});

		it("includes the date without markdown bold", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("Date: 2026-03-26");
			expect(output).not.toContain("**Date:**");
		});

		it("includes level for ASVS reports", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("Level: 1");
		});

		it("includes summary without markdown bullets and with coverage", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("Total requirements: 3");
			expect(output).toContain("Passed: 1 (33%)");
			expect(output).toContain("Failed: 1 (33%)");
			expect(output).toContain("Coverage: 67% (requirements testable by Kovar)");
		});

		it("includes failed requirements with severity tags", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("V14.4.1 -- HTTP Security Headers [FAIL]");
			expect(output).toContain("[CRITICAL]");
		});

		it("includes all unique remediations in text format", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("Remediation: Set a Content-Security-Policy header.");
			expect(output).toContain(
				"Remediation: Set Strict-Transport-Security: max-age=63072000; includeSubDomains",
			);
			expect(output).not.toContain("**Remediation:**");
		});

		it("includes passed requirements", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("V14.4.5 -- X-Content-Type-Options [PASS]");
		});

		it("includes not tested section", () => {
			const report = makeReport();
			const output = formatComplianceReport(report, "text");
			expect(output).toContain("Not Tested");
			expect(output).toContain("V99.1.1 -- Auth Flows");
		});

		it("omits failed section when nothing failed", () => {
			const report = makeReport({
				summary: { total: 1, passed: 1, failed: 0, notTested: 0, coverage: 100 },
				requirements: [
					{
						id: "V14.4.5",
						standard: "owasp-asvs",
						title: "X-Content-Type-Options",
						description: "Test",
						level: 1,
						kovarCheckIds: ["header-missing-xcto"],
						status: "pass",
						findings: [],
					},
				],
			});
			const output = formatComplianceReport(report, "text");
			expect(output).not.toContain("Failed Requirements");
		});
	});
});
