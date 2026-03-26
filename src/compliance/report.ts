import type { ComplianceReport, ComplianceReportFormat } from "./types.js";

function severityTag(severity: string): string {
	return `[${severity.toUpperCase()}]`;
}

function formatMarkdown(report: ComplianceReport): string {
	const lines: string[] = [];
	const date = report.timestamp.split("T")[0] ?? report.timestamp;

	lines.push(`# ${report.standard} ${report.version} Compliance Report`);
	lines.push("");
	lines.push(`**Date:** ${date}`);

	const asvsLevel = report.requirements.find((r) => r.level !== undefined)?.level;
	if (asvsLevel !== undefined) {
		lines.push(`**Level:** ${asvsLevel}`);
	}

	lines.push("");
	lines.push("## Summary");
	lines.push(`- Total requirements: ${report.summary.total}`);
	lines.push(
		`- Passed: ${report.summary.passed} (${formatPercent(report.summary.passed, report.summary.total)})`,
	);
	lines.push(
		`- Failed: ${report.summary.failed} (${formatPercent(report.summary.failed, report.summary.total)})`,
	);
	lines.push(
		`- Not tested: ${report.summary.notTested} (${formatPercent(report.summary.notTested, report.summary.total)})`,
	);
	lines.push(`- Coverage: ${report.summary.coverage}% (requirements testable by Kovar)`);

	const failed = report.requirements.filter((r) => r.status === "fail");
	if (failed.length > 0) {
		lines.push("");
		lines.push("## Failed Requirements");
		for (const req of failed) {
			lines.push("");
			lines.push(`### ${req.id} — ${req.title} [FAIL]`);
			for (const f of req.findings) {
				lines.push(`- ${severityTag(f.severity)} ${f.message}`);
			}
			const uniqueRemediations = [
				...new Set(req.findings.map((f) => f.remediation).filter(Boolean)),
			];
			if (uniqueRemediations.length > 0) {
				lines.push("");
				lines.push("**Remediations:**");
				for (const rem of uniqueRemediations) {
					lines.push(`- ${rem}`);
				}
			}
		}
	}

	const passed = report.requirements.filter((r) => r.status === "pass");
	if (passed.length > 0) {
		lines.push("");
		lines.push("## Passed Requirements");
		for (const req of passed) {
			lines.push(`- ${req.id} — ${req.title} ✓`);
		}
	}

	const notTested = report.requirements.filter((r) => r.status === "not-tested");
	if (notTested.length > 0) {
		lines.push("");
		lines.push("## Not Tested");
		for (const req of notTested) {
			lines.push(`- ${req.id} — ${req.title}`);
		}
	}

	lines.push("");
	return lines.join("\n");
}

function formatText(report: ComplianceReport): string {
	const lines: string[] = [];
	const date = report.timestamp.split("T")[0] ?? report.timestamp;

	lines.push(`${report.standard} ${report.version} Compliance Report`);
	lines.push("=".repeat((lines[0] ?? "").length));
	lines.push("");
	lines.push(`Date: ${date}`);

	const asvsLevel = report.requirements.find((r) => r.level !== undefined)?.level;
	if (asvsLevel !== undefined) {
		lines.push(`Level: ${asvsLevel}`);
	}

	lines.push("");
	lines.push("Summary");
	lines.push("-".repeat(7));
	lines.push(`Total requirements: ${report.summary.total}`);
	lines.push(
		`Passed: ${report.summary.passed} (${formatPercent(report.summary.passed, report.summary.total)})`,
	);
	lines.push(
		`Failed: ${report.summary.failed} (${formatPercent(report.summary.failed, report.summary.total)})`,
	);
	lines.push(
		`Not tested: ${report.summary.notTested} (${formatPercent(report.summary.notTested, report.summary.total)})`,
	);
	lines.push(`Coverage: ${report.summary.coverage}% (requirements testable by Kovar)`);

	const failed = report.requirements.filter((r) => r.status === "fail");
	if (failed.length > 0) {
		lines.push("");
		lines.push("Failed Requirements");
		lines.push("-".repeat(19));
		for (const req of failed) {
			lines.push("");
			lines.push(`${req.id} -- ${req.title} [FAIL]`);
			for (const f of req.findings) {
				lines.push(`  ${severityTag(f.severity)} ${f.message}`);
			}
			const uniqueRemediations = [
				...new Set(req.findings.map((f) => f.remediation).filter(Boolean)),
			];
			if (uniqueRemediations.length > 0) {
				for (const rem of uniqueRemediations) {
					lines.push(`  Remediation: ${rem}`);
				}
			}
		}
	}

	const passed = report.requirements.filter((r) => r.status === "pass");
	if (passed.length > 0) {
		lines.push("");
		lines.push("Passed Requirements");
		lines.push("-".repeat(19));
		for (const req of passed) {
			lines.push(`  ${req.id} -- ${req.title} [PASS]`);
		}
	}

	const notTested = report.requirements.filter((r) => r.status === "not-tested");
	if (notTested.length > 0) {
		lines.push("");
		lines.push("Not Tested");
		lines.push("-".repeat(10));
		for (const req of notTested) {
			lines.push(`  ${req.id} -- ${req.title}`);
		}
	}

	lines.push("");
	return lines.join("\n");
}

function formatPercent(count: number, total: number): string {
	if (total === 0) return "0%";
	return `${Math.round((count / total) * 100)}%`;
}

export function formatComplianceReport(
	report: ComplianceReport,
	format: ComplianceReportFormat,
): string {
	switch (format) {
		case "json":
			return JSON.stringify(report, null, 2);
		case "markdown":
			return formatMarkdown(report);
		case "text":
			return formatText(report);
	}
}
