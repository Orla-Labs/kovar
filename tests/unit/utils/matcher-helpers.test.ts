import { describe, expect, it } from "vitest";
import type { SecurityFinding } from "../../../src/types/results.js";
import { filterFailures, formatMatcherMessage } from "../../../src/utils/matcher-helpers.js";

const makeFinding = (overrides: Partial<SecurityFinding> = {}): SecurityFinding => ({
	id: "test-finding",
	category: "headers",
	severity: "high",
	message: "Test message",
	remediation: "Fix it",
	...overrides,
});

describe("filterFailures", () => {
	it("returns critical and high findings by default", () => {
		const findings: SecurityFinding[] = [
			makeFinding({ severity: "critical" }),
			makeFinding({ severity: "high" }),
			makeFinding({ severity: "medium" }),
			makeFinding({ severity: "low" }),
			makeFinding({ severity: "info" }),
		];
		const result = filterFailures(findings);
		expect(result).toHaveLength(2);
		expect(result[0]!.severity).toBe("critical");
		expect(result[1]!.severity).toBe("high");
	});

	it("filters by custom severity list", () => {
		const findings: SecurityFinding[] = [
			makeFinding({ severity: "critical" }),
			makeFinding({ severity: "medium" }),
			makeFinding({ severity: "low" }),
		];
		const result = filterFailures(findings, ["medium", "low"]);
		expect(result).toHaveLength(2);
		expect(result[0]!.severity).toBe("medium");
		expect(result[1]!.severity).toBe("low");
	});

	it("returns empty array when no findings match", () => {
		const findings: SecurityFinding[] = [
			makeFinding({ severity: "info" }),
			makeFinding({ severity: "low" }),
		];
		const result = filterFailures(findings);
		expect(result).toHaveLength(0);
	});

	it("returns empty array for empty input", () => {
		expect(filterFailures([])).toHaveLength(0);
	});

	it("handles single-severity filter", () => {
		const findings: SecurityFinding[] = [
			makeFinding({ severity: "critical" }),
			makeFinding({ severity: "high" }),
		];
		const result = filterFailures(findings, ["critical"]);
		expect(result).toHaveLength(1);
		expect(result[0]!.severity).toBe("critical");
	});
});

describe("formatMatcherMessage", () => {
	const mockUtils = {
		matcherHint: (name: string, _a?: string, _b?: string, _opts?: object) =>
			`expect(received).${name}()`,
	};

	it("returns pass message when findings are empty", () => {
		const result = formatMatcherMessage([], "toHaveSecureHeaders", "All good.", mockUtils, false);
		expect(result).toBe("expect(received).toHaveSecureHeaders()\n\nAll good.");
	});

	it("formats header findings with header field", () => {
		const findings: SecurityFinding[] = [
			makeFinding({
				severity: "critical",
				header: "strict-transport-security",
				message: "Missing HSTS header",
				remediation: "Add HSTS header",
			}),
		];
		const result = formatMatcherMessage(
			findings,
			"toHaveSecureHeaders",
			"All good.",
			mockUtils,
			false,
		);
		expect(result).toContain("[CRITICAL] strict-transport-security: Missing HSTS header");
		expect(result).toContain("Fix: Add HSTS header");
	});

	it("formats cookie findings with cookie field", () => {
		const findings: SecurityFinding[] = [
			makeFinding({
				severity: "high",
				cookie: "session_id",
				message: "Missing Secure flag",
				remediation: "Add Secure flag",
			}),
		];
		const result = formatMatcherMessage(
			findings,
			"toHaveSecureCookies",
			"All cookies secure.",
			mockUtils,
			false,
		);
		expect(result).toContain("[HIGH] session_id: Missing Secure flag");
		expect(result).toContain("Fix: Add Secure flag");
	});

	it("formats findings with payload field", () => {
		const findings: SecurityFinding[] = [
			makeFinding({
				severity: "critical",
				category: "xss",
				message: "XSS payload reflected",
				payload: "<script>alert(1)</script>",
				remediation: "Escape input",
			}),
		];
		const result = formatMatcherMessage(
			findings,
			"toBeResilientToXSS",
			"No XSS.",
			mockUtils,
			false,
		);
		expect(result).toContain("[CRITICAL] XSS payload reflected");
		expect(result).toContain("Payload: <script>alert(1)</script>");
		expect(result).toContain("Fix: Escape input");
	});

	it("formats findings without header/cookie/payload", () => {
		const findings: SecurityFinding[] = [
			makeFinding({
				severity: "high",
				message: "CSRF token missing",
				remediation: "Add CSRF token",
			}),
		];
		const result = formatMatcherMessage(
			findings,
			"toBeCSRFProtected",
			"CSRF OK.",
			mockUtils,
			false,
		);
		expect(result).toContain("[HIGH] CSRF token missing");
		expect(result).toContain("Fix: Add CSRF token");
		expect(result).not.toContain("Payload:");
	});

	it("formats multiple findings separated by double newlines", () => {
		const findings: SecurityFinding[] = [
			makeFinding({ severity: "critical", message: "First issue", remediation: "Fix 1" }),
			makeFinding({ severity: "high", message: "Second issue", remediation: "Fix 2" }),
		];
		const result = formatMatcherMessage(findings, "testMatcher", "OK.", mockUtils, false);
		expect(result).toContain("[CRITICAL] First issue");
		expect(result).toContain("[HIGH] Second issue");
		const parts = result.split("\n\n");
		expect(parts.length).toBeGreaterThanOrEqual(3);
	});

	it("passes isNot to matcherHint", () => {
		const spyUtils = {
			matcherHint: (name: string, _a?: string, _b?: string, opts?: { isNot?: boolean }) => {
				expect(opts?.isNot).toBe(true);
				return `expect(received).not.${name}()`;
			},
		};
		const result = formatMatcherMessage([], "testMatcher", "OK.", spyUtils, true);
		expect(result).toContain(".not.testMatcher()");
	});
});
