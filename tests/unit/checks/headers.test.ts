import { describe, expect, it } from "vitest";
import { analyzeHeaders } from "../../../src/checks/headers.js";

const SECURE_HEADERS: Record<string, string> = {
	"strict-transport-security": "max-age=63072000; includeSubDomains",
	"content-security-policy": "default-src 'self'",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
	"referrer-policy": "strict-origin-when-cross-origin",
	"permissions-policy": "geolocation=()",
	"cross-origin-opener-policy": "same-origin",
	"cross-origin-resource-policy": "same-origin",
	"cross-origin-embedder-policy": "require-corp",
};

describe("analyzeHeaders", () => {
	it("returns no critical/high findings for fully secure headers", () => {
		const findings = analyzeHeaders(SECURE_HEADERS);
		const serious = findings.filter((f) => f.severity === "critical" || f.severity === "high");
		expect(serious).toHaveLength(0);
	});

	it("reports missing HSTS as critical", () => {
		const findings = analyzeHeaders({});
		const hsts = findings.find((f) => f.id === "header-missing-hsts");
		expect(hsts).toBeDefined();
		expect(hsts!.severity).toBe("critical");
	});

	it("reports HSTS with low max-age", () => {
		const findings = analyzeHeaders({
			"strict-transport-security": "max-age=3600",
		});
		const hsts = findings.find((f) => f.id === "header-missing-hsts");
		expect(hsts).toBeDefined();
		expect(hsts!.message).toContain("3600");
	});

	it("reports missing CSP as critical", () => {
		const findings = analyzeHeaders({});
		const csp = findings.find((f) => f.id === "header-missing-csp");
		expect(csp).toBeDefined();
		expect(csp!.severity).toBe("critical");
	});

	it("reports missing X-Content-Type-Options as high", () => {
		const findings = analyzeHeaders({});
		const xcto = findings.find((f) => f.id === "header-missing-xcto");
		expect(xcto).toBeDefined();
		expect(xcto!.severity).toBe("high");
	});

	it("reports wrong X-Content-Type-Options value", () => {
		const findings = analyzeHeaders({ "x-content-type-options": "wrong" });
		const xcto = findings.find((f) => f.id === "header-missing-xcto");
		expect(xcto).toBeDefined();
		expect(xcto!.message).toContain("wrong");
	});

	it("reports missing X-Frame-Options as high", () => {
		const findings = analyzeHeaders({});
		const xfo = findings.find((f) => f.id === "header-missing-xfo");
		expect(xfo).toBeDefined();
		expect(xfo!.severity).toBe("high");
	});

	it("accepts X-Frame-Options SAMEORIGIN", () => {
		const findings = analyzeHeaders({ "x-frame-options": "SAMEORIGIN" });
		const xfo = findings.find((f) => f.id === "header-missing-xfo");
		expect(xfo).toBeUndefined();
	});

	it("flags unsafe-url referrer policy", () => {
		const findings = analyzeHeaders({ "referrer-policy": "unsafe-url" });
		const rp = findings.find((f) => f.id === "header-missing-referrer-policy");
		expect(rp).toBeDefined();
		expect(rp!.message).toContain("unsafe-url");
	});

	it("flags X-Powered-By when present", () => {
		const findings = analyzeHeaders({ "x-powered-by": "Express" });
		const xpb = findings.find((f) => f.id === "header-remove-x-powered-by");
		expect(xpb).toBeDefined();
		expect(xpb!.severity).toBe("low");
	});

	it("flags Server header with version info", () => {
		const findings = analyzeHeaders({ server: "Apache/2.4.41" });
		const srv = findings.find((f) => f.id === "header-remove-server");
		expect(srv).toBeDefined();
	});

	it("does not flag Server header without version", () => {
		const findings = analyzeHeaders({ server: "nginx" });
		const srv = findings.find((f) => f.id === "header-remove-server");
		expect(srv).toBeUndefined();
	});

	it("flags deprecated X-XSS-Protection with non-zero value", () => {
		const findings = analyzeHeaders({ "x-xss-protection": "1; mode=block" });
		const xxp = findings.find((f) => f.id === "header-deprecated-xxp");
		expect(xxp).toBeDefined();
	});

	it("does not flag X-XSS-Protection set to 0", () => {
		const findings = analyzeHeaders({ "x-xss-protection": "0" });
		const xxp = findings.find((f) => f.id === "header-deprecated-xxp");
		expect(xxp).toBeUndefined();
	});

	it("flags overly permissive CSP with wildcard default-src", () => {
		const findings = analyzeHeaders({
			"content-security-policy": "default-src *",
		});
		const csp = findings.find((f) => f.id === "header-missing-csp");
		expect(csp).toBeDefined();
		expect(csp!.message).toContain("overly permissive");
	});

	it("flags CSP with unsafe-inline script-src", () => {
		const findings = analyzeHeaders({
			"content-security-policy": "default-src 'self'; script-src 'unsafe-inline'",
		});
		const csp = findings.find((f) => f.id === "header-missing-csp");
		expect(csp).toBeDefined();
	});

	it("accepts CSP with nonce-based inline scripts", () => {
		const findings = analyzeHeaders({
			"content-security-policy": "default-src 'self'; script-src 'nonce-abc123' 'unsafe-inline'",
		});
		const csp = findings.find((f) => f.id === "header-missing-csp");
		expect(csp).toBeUndefined();
	});

	describe("CSP evaluation edge cases", () => {
		const cspFinding = (csp: string) =>
			analyzeHeaders({ ...SECURE_HEADERS, "content-security-policy": csp }).find(
				(f) => f.id === "header-missing-csp",
			);

		it.each([
			["default-src 'self' 'unsafe-inline'"],
			["frame-ancestors 'none'"],
			["default-src 'self'; script-src 'self' https: data:"],
			["default-src 'self'; SCRIPT-SRC 'self' 'unsafe-eval'"],
			["script-src 'self' https://*.example.com"],
		])("flags weak policy %s", (csp) => {
			expect(cspFinding(csp)).toBeDefined();
		});

		it.each([
			[
				"script-src 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'strict-dynamic' 'unsafe-inline' https:; object-src 'none'",
			],
			["script-src 'nonce-r4nd' 'strict-dynamic' https: 'unsafe-inline'"],
			["default-src 'self'; img-src *"],
			["default-src 'self' 'unsafe-inline', script-src 'self'"],
		])("accepts strong policy %s", (csp) => {
			expect(cspFinding(csp)).toBeUndefined();
		});
	});

	it("accepts identical repeated X-Frame-Options / X-Content-Type-Options", () => {
		const findings = analyzeHeaders({
			...SECURE_HEADERS,
			"x-frame-options": "DENY, DENY",
			"x-content-type-options": "nosniff\nnosniff",
		});
		expect(findings.filter((f) => f.severity === "high")).toEqual([]);
	});

	it("still flags conflicting repeated X-Frame-Options", () => {
		const findings = analyzeHeaders({ ...SECURE_HEADERS, "x-frame-options": "DENY, ALLOWALL" });
		expect(findings.find((f) => f.id === "header-missing-xfo")).toBeDefined();
	});

	it("accepts CSP frame-ancestors in place of X-Frame-Options", () => {
		const { "x-frame-options": _xfo, ...rest } = SECURE_HEADERS;
		const findings = analyzeHeaders({
			...rest,
			"content-security-policy": "default-src 'self'; frame-ancestors 'none'",
		});
		expect(findings.find((f) => f.id === "header-missing-xfo")).toBeUndefined();
	});

	it("parses quoted HSTS max-age", () => {
		const findings = analyzeHeaders({
			...SECURE_HEADERS,
			"strict-transport-security": 'max-age="63072000"; includeSubDomains',
		});
		expect(findings.find((f) => f.id === "header-missing-hsts")).toBeUndefined();
	});

	it("throws on skip/only names that are not header names (e.g. 'HSTS')", () => {
		expect(() => analyzeHeaders(SECURE_HEADERS, { skip: ["HSTS"] })).toThrow(/Unknown header/);
		expect(() => analyzeHeaders(SECURE_HEADERS, { only: ["csp"] })).toThrow(/Unknown header/);
	});

	it("respects skip option", () => {
		const findings = analyzeHeaders(
			{},
			{ skip: ["strict-transport-security", "content-security-policy"] },
		);
		expect(findings.find((f) => f.id === "header-missing-hsts")).toBeUndefined();
		expect(findings.find((f) => f.id === "header-missing-csp")).toBeUndefined();
	});

	it("respects only option", () => {
		const findings = analyzeHeaders({}, { only: ["strict-transport-security"] });
		expect(findings).toHaveLength(1);
		expect(findings[0]!.id).toBe("header-missing-hsts");
	});

	it("checks required CSP directives", () => {
		const findings = analyzeHeaders(
			{ "content-security-policy": "default-src 'self'" },
			{ requiredCSPDirectives: ["script-src", "style-src"] },
		);
		const missing = findings.filter((f) => f.id.startsWith("header-csp-missing-directive"));
		expect(missing).toHaveLength(2);
	});

	it("respects custom minHSTSMaxAge", () => {
		const findings = analyzeHeaders(
			{ "strict-transport-security": "max-age=86400" },
			{ minHSTSMaxAge: 604800 },
		);
		const hsts = findings.find((f) => f.id === "header-missing-hsts");
		expect(hsts).toBeDefined();
		expect(hsts!.message).toContain("604800");
	});

	it("normalizes header names to lowercase", () => {
		const findings = analyzeHeaders({
			"Strict-Transport-Security": "max-age=63072000",
			"Content-Security-Policy": "default-src 'self'",
		});
		expect(findings.find((f) => f.id === "header-missing-hsts")).toBeUndefined();
		expect(findings.find((f) => f.id === "header-missing-csp")).toBeUndefined();
	});

	it("includes remediation on every finding", () => {
		const findings = analyzeHeaders({});
		for (const finding of findings) {
			expect(finding.remediation).toBeTruthy();
			expect(finding.category).toBe("headers");
		}
	});
});
