import { describe, expect, it } from "vitest";
import type { Framework } from "../../../src/remediation/types.js";
import { remediateXSS } from "../../../src/remediation/xss.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function makeXSSFinding(id: string, url?: string, evidence?: string): SecurityFinding {
	return {
		id,
		category: "xss",
		severity: "critical",
		message: `XSS payload reflected unescaped in response via "search" field`,
		remediation: `Sanitize and escape user input in "search" before rendering`,
		url,
		evidence,
	};
}

const FRAMEWORKS: Framework[] = ["express", "fastify", "next", "koa", "hono", "generic"];

describe("remediateXSS", () => {
	it("generates a suggestion for an xss-prefixed finding", () => {
		const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
		const { suggestions, unsupported } = remediateXSS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(1);
		expect(unsupported).toHaveLength(0);
	});

	it("deduplicates suggestions by endpoint", () => {
		const findings = [
			makeXSSFinding("xss-poly-001", "http://localhost/search"),
			makeXSSFinding("xss-poly-002", "http://localhost/search"),
			makeXSSFinding("xss-poly-003", "http://localhost/search"),
		];
		const { suggestions } = remediateXSS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(1);
	});

	it("generates separate suggestions for different endpoints", () => {
		const findings = [
			makeXSSFinding("xss-poly-001", "http://localhost/search"),
			makeXSSFinding("xss-poly-002", "http://localhost/comments"),
		];
		const { suggestions } = remediateXSS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(2);
	});

	it("tracks non-xss-prefixed findings as unsupported", () => {
		const findings: SecurityFinding[] = [
			{
				id: "unknown-xss-type",
				category: "xss",
				severity: "high",
				message: "Unknown XSS",
				remediation: "Fix it",
			},
		];
		const { suggestions, unsupported } = remediateXSS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toEqual(["unknown-xss-type"]);
	});

	it("skips xss-no-forms informational findings", () => {
		const findings: SecurityFinding[] = [
			{
				id: "xss-no-forms",
				category: "xss",
				severity: "info",
				message: "No forms found",
				remediation: "Ensure forms exist",
			},
		];
		const { suggestions, unsupported } = remediateXSS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toHaveLength(0);
	});

	it("skips non-xss category findings", () => {
		const findings: SecurityFinding[] = [
			{
				id: "header-missing-hsts",
				category: "headers",
				severity: "high",
				message: "Missing HSTS",
				remediation: "Fix it",
			},
		];
		const { suggestions, unsupported } = remediateXSS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toHaveLength(0);
	});

	it("uses escapeStr for finding messages in descriptions", () => {
		const findings = [
			makeXSSFinding("xss-poly-001", "http://localhost/search", "payload reflected"),
		];
		const { suggestions } = remediateXSS(findings, "express", "typescript");
		expect(suggestions[0]!.description).toContain("Sanitize user input");
		expect(suggestions[0]!.description).toContain('\\"search\\"');
	});

	it("sets confidence to high for all XSS remediations", () => {
		const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
		const { suggestions } = remediateXSS(findings, "express", "typescript");
		expect(suggestions[0]!.confidence).toBe("high");
	});

	it("includes OWASP and MDN references", () => {
		const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
		const { suggestions } = remediateXSS(findings, "express", "typescript");
		expect(suggestions[0]!.references.length).toBeGreaterThan(0);
		expect(suggestions[0]!.references.some((r) => r.includes("owasp.org"))).toBe(true);
		expect(suggestions[0]!.references.some((r) => r.includes("mozilla.org"))).toBe(true);
	});

	describe("express framework", () => {
		it("generates he.encode() middleware", () => {
			const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
			const { suggestions } = remediateXSS(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("he.encode");
			expect(suggestions[0]!.code).toContain("sanitizeInput");
			expect(suggestions[0]!.code).toContain("app.use");
			expect(suggestions[0]!.framework).toBe("express");
			expect(suggestions[0]!.filePath).toBe("middleware.ts");
		});

		it("includes type annotations for typescript", () => {
			const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
			const { suggestions } = remediateXSS(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain(": string");
		});

		it("omits type annotations for javascript", () => {
			const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
			const { suggestions } = remediateXSS(findings, "express", "javascript");
			expect(suggestions[0]!.code).not.toContain(": string");
		});
	});

	describe("next framework", () => {
		it("warns about dangerouslySetInnerHTML and suggests DOMPurify", () => {
			const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
			const { suggestions } = remediateXSS(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain("dangerouslySetInnerHTML");
			expect(suggestions[0]!.code).toContain("DOMPurify");
			expect(suggestions[0]!.framework).toBe("next");
			expect(suggestions[0]!.filePath).toBe("components/SafeHTML.tsx");
		});
	});

	describe("fastify framework", () => {
		it("generates preHandler hook with he.encode()", () => {
			const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
			const { suggestions } = remediateXSS(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("he.encode");
			expect(suggestions[0]!.code).toContain("preHandler");
			expect(suggestions[0]!.framework).toBe("fastify");
			expect(suggestions[0]!.filePath).toBe("plugins/security.ts");
		});
	});

	describe("koa framework", () => {
		it("generates middleware with he.encode()", () => {
			const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
			const { suggestions } = remediateXSS(findings, "koa", "typescript");
			expect(suggestions[0]!.code).toContain("he.encode");
			expect(suggestions[0]!.code).toContain("ctx.request.body");
			expect(suggestions[0]!.code).toContain("await next()");
			expect(suggestions[0]!.framework).toBe("koa");
		});
	});

	describe("hono framework", () => {
		it("generates middleware with he.encode()", () => {
			const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
			const { suggestions } = remediateXSS(findings, "hono", "typescript");
			expect(suggestions[0]!.code).toContain("he.encode");
			expect(suggestions[0]!.code).toContain("c.req.parseBody");
			expect(suggestions[0]!.framework).toBe("hono");
		});
	});

	describe("generic framework", () => {
		it("generates HTML-encoding guidance", () => {
			const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
			const { suggestions } = remediateXSS(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("HTML-encode");
			expect(suggestions[0]!.code).toContain("&amp;");
			expect(suggestions[0]!.code).toContain("&lt;");
			expect(suggestions[0]!.framework).toBe("generic");
		});
	});

	it("generates suggestions for all frameworks without errors", () => {
		const findings = [
			makeXSSFinding("xss-poly-001", "http://localhost/search"),
			makeXSSFinding("xss-poly-002", "http://localhost/comments"),
		];
		for (const framework of FRAMEWORKS) {
			const { suggestions, unsupported } = remediateXSS(findings, framework, "typescript");
			expect(suggestions).toHaveLength(2);
			expect(unsupported).toHaveLength(0);
			for (const suggestion of suggestions) {
				expect(suggestion.framework).toBe(framework);
				expect(suggestion.code).toBeTruthy();
				expect(suggestion.description).toBeTruthy();
				expect(suggestion.references.length).toBeGreaterThan(0);
			}
		}
	});

	it("respects the language option", () => {
		const findings = [makeXSSFinding("xss-poly-001", "http://localhost/search")];
		const ts = remediateXSS(findings, "express", "typescript");
		const js = remediateXSS(findings, "express", "javascript");
		expect(ts.suggestions[0]!.language).toBe("typescript");
		expect(js.suggestions[0]!.language).toBe("javascript");
	});

	it("handles xss-dom- prefixed findings", () => {
		const findings = [makeXSSFinding("xss-dom-poly-001", "http://localhost/search")];
		const { suggestions, unsupported } = remediateXSS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(1);
		expect(unsupported).toHaveLength(0);
	});
});
