import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecurityFinding } from "../../../src/types/index.js";

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
	return {
		id: "header-missing-hsts",
		category: "headers",
		severity: "critical",
		message: "Missing HSTS header",
		remediation: "Add Strict-Transport-Security header",
		...overrides,
	};
}

function makeTestResult(findings: SecurityFinding[]) {
	return {
		attachments: [
			{
				name: "kovar-findings",
				contentType: "application/json",
				body: Buffer.from(JSON.stringify(findings)),
			},
		],
	};
}

function makeEmptyTestResult() {
	return { attachments: [] };
}

async function createReporter() {
	const mod = await import("../../../src/reporter/security-reporter.js");
	const ReporterClass = mod.default;
	return new ReporterClass();
}

describe("SecurityReporter", () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	it("onTestEnd correctly parses findings from test attachments", async () => {
		const reporter = await createReporter();
		const findings = [
			makeFinding({ id: "header-missing-hsts", severity: "critical" }),
			makeFinding({ id: "header-missing-csp", severity: "high" }),
		];

		reporter.onTestEnd({} as never, makeTestResult(findings) as never);
		reporter.onEnd({} as never);

		expect(consoleSpy).toHaveBeenCalled();
		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Kovar Security Summary");
		expect(output).toContain("1 critical");
		expect(output).toContain("1 high");
	});

	it("onEnd produces formatted output with finding summaries", async () => {
		const reporter = await createReporter();
		const findings = [
			makeFinding({ severity: "critical" }),
			makeFinding({ severity: "medium", id: "cookie-samesite-none" }),
			makeFinding({ severity: "low", id: "header-info-referrer" }),
		];

		reporter.onTestEnd({} as never, makeTestResult(findings) as never);
		reporter.onEnd({} as never);

		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Score:");
		expect(output).toContain("1 critical");
		expect(output).toContain("1 medium");
		expect(output).toContain("1 low");
		expect(output).toContain("1 test(s) with security findings");
	});

	it("handles test with no findings gracefully", async () => {
		const reporter = await createReporter();

		reporter.onTestEnd({} as never, makeEmptyTestResult() as never);
		reporter.onEnd({} as never);

		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it("handles test with multiple findings across categories", async () => {
		const reporter = await createReporter();

		const headerFindings = [
			makeFinding({ id: "header-missing-hsts", category: "headers", severity: "critical" }),
			makeFinding({ id: "header-missing-csp", category: "headers", severity: "critical" }),
		];
		const cookieFindings = [
			makeFinding({
				id: "cookie-missing-secure",
				category: "cookies",
				severity: "high",
			}),
		];
		const xssFindings = [
			makeFinding({
				id: "xss-reflected",
				category: "xss",
				severity: "medium",
			}),
			makeFinding({
				id: "xss-stored",
				category: "xss",
				severity: "low",
			}),
		];

		reporter.onTestEnd({} as never, makeTestResult(headerFindings) as never);
		reporter.onTestEnd({} as never, makeTestResult(cookieFindings) as never);
		reporter.onTestEnd({} as never, makeTestResult(xssFindings) as never);
		reporter.onEnd({} as never);

		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("2 critical");
		expect(output).toContain("1 high");
		expect(output).toContain("1 medium");
		expect(output).toContain("1 low");
		expect(output).toContain("3 test(s) with security findings");
	});

	it("ignores attachments that are not kovar-findings", async () => {
		const reporter = await createReporter();

		const result = {
			attachments: [
				{
					name: "screenshot",
					contentType: "image/png",
					body: Buffer.from("fake-image"),
				},
				{
					name: "kovar-findings",
					contentType: "application/json",
					body: Buffer.from(JSON.stringify([makeFinding()])),
				},
			],
		};

		reporter.onTestEnd({} as never, result as never);
		reporter.onEnd({} as never);

		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("1 critical");
	});

	it("does not count tests with empty findings arrays", async () => {
		const reporter = await createReporter();

		reporter.onTestEnd({} as never, makeTestResult([]) as never);
		reporter.onEnd({} as never);

		expect(consoleSpy).not.toHaveBeenCalled();
	});
});
