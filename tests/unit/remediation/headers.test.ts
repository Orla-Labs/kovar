import { describe, expect, it } from "vitest";
import { remediateHeaders } from "../../../src/remediation/headers.js";
import type { Framework } from "../../../src/remediation/types.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function makeHeaderFinding(id: string, header: string): SecurityFinding {
	return {
		id,
		category: "headers",
		severity: "high",
		header,
		message: `${header} issue`,
		remediation: `Fix ${header}`,
	};
}

const ALL_HEADER_IDS = [
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
] as const;

const FRAMEWORKS: Framework[] = ["express", "fastify", "next", "koa", "hono", "generic"];

describe("remediateHeaders", () => {
	it("generates a suggestion for every known header finding ID", () => {
		const findings = ALL_HEADER_IDS.map((id) => makeHeaderFinding(id, id));
		const { suggestions, unsupported } = remediateHeaders(findings, "express", "typescript");
		expect(suggestions).toHaveLength(ALL_HEADER_IDS.length);
		expect(unsupported).toHaveLength(0);
	});

	it("tracks unsupported header finding IDs", () => {
		const findings: SecurityFinding[] = [makeHeaderFinding("header-unknown-thing", "x-custom")];
		const { suggestions, unsupported } = remediateHeaders(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toEqual(["header-unknown-thing"]);
	});

	it("skips non-header findings", () => {
		const findings: SecurityFinding[] = [
			{
				id: "cookie-missing-secure",
				category: "cookies",
				severity: "critical",
				message: "Missing Secure",
				remediation: "Fix it",
			},
		];
		const { suggestions, unsupported } = remediateHeaders(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toHaveLength(0);
	});

	describe("express framework", () => {
		it("generates res.set() middleware for set-header findings", () => {
			const findings = [makeHeaderFinding("header-missing-hsts", "strict-transport-security")];
			const { suggestions } = remediateHeaders(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain('res.set("Strict-Transport-Security"');
			expect(suggestions[0]!.code).toContain("max-age=63072000");
			expect(suggestions[0]!.code).toContain("next()");
			expect(suggestions[0]!.framework).toBe("express");
			expect(suggestions[0]!.filePath).toBe("middleware.ts");
		});

		it("generates res.removeHeader() for remove-header findings", () => {
			const findings = [makeHeaderFinding("header-remove-x-powered-by", "x-powered-by")];
			const { suggestions } = remediateHeaders(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain('res.removeHeader("X-Powered-By")');
		});
	});

	describe("fastify framework", () => {
		it("generates reply.header() hook for set-header findings", () => {
			const findings = [makeHeaderFinding("header-missing-hsts", "strict-transport-security")];
			const { suggestions } = remediateHeaders(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain('reply.header("Strict-Transport-Security"');
			expect(suggestions[0]!.code).toContain("onSend");
			expect(suggestions[0]!.framework).toBe("fastify");
			expect(suggestions[0]!.filePath).toBe("plugins/security.ts");
		});

		it("generates reply.removeHeader() for remove-header findings", () => {
			const findings = [makeHeaderFinding("header-remove-server", "server")];
			const { suggestions } = remediateHeaders(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain('reply.removeHeader("Server")');
		});
	});

	describe("next framework", () => {
		it("generates headers config for set-header findings", () => {
			const findings = [makeHeaderFinding("header-missing-xcto", "x-content-type-options")];
			const { suggestions } = remediateHeaders(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain('key: "X-Content-Type-Options"');
			expect(suggestions[0]!.code).toContain('value: "nosniff"');
			expect(suggestions[0]!.code).toContain("/(.*)");
			expect(suggestions[0]!.framework).toBe("next");
			expect(suggestions[0]!.filePath).toBe("next.config.js");
		});

		it("generates empty value for remove-header findings", () => {
			const findings = [makeHeaderFinding("header-deprecated-xxp", "x-xss-protection")];
			const { suggestions } = remediateHeaders(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain('key: "X-XSS-Protection"');
			expect(suggestions[0]!.code).toContain('value: ""');
		});
	});

	describe("koa framework", () => {
		it("generates ctx.set() middleware for set-header findings", () => {
			const findings = [makeHeaderFinding("header-missing-xfo", "x-frame-options")];
			const { suggestions } = remediateHeaders(findings, "koa", "typescript");
			expect(suggestions[0]!.code).toContain('ctx.set("X-Frame-Options", "DENY")');
			expect(suggestions[0]!.code).toContain("await next()");
			expect(suggestions[0]!.framework).toBe("koa");
		});

		it("generates ctx.remove() for remove-header findings", () => {
			const findings = [makeHeaderFinding("header-remove-x-powered-by", "x-powered-by")];
			const { suggestions } = remediateHeaders(findings, "koa", "typescript");
			expect(suggestions[0]!.code).toContain('ctx.remove("X-Powered-By")');
		});
	});

	describe("hono framework", () => {
		it("generates c.header() middleware for set-header findings", () => {
			const findings = [makeHeaderFinding("header-missing-referrer-policy", "referrer-policy")];
			const { suggestions } = remediateHeaders(findings, "hono", "typescript");
			expect(suggestions[0]!.code).toContain(
				'c.header("Referrer-Policy", "strict-origin-when-cross-origin")',
			);
			expect(suggestions[0]!.code).toContain("await next()");
			expect(suggestions[0]!.framework).toBe("hono");
		});

		it("generates empty c.header() for remove-header findings", () => {
			const findings = [makeHeaderFinding("header-remove-server", "server")];
			const { suggestions } = remediateHeaders(findings, "hono", "typescript");
			expect(suggestions[0]!.code).toContain('c.header("Server", "")');
		});
	});

	describe("generic framework", () => {
		it("generates comment-based guidance for set-header findings", () => {
			const findings = [makeHeaderFinding("header-missing-coep", "cross-origin-embedder-policy")];
			const { suggestions } = remediateHeaders(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("Cross-Origin-Embedder-Policy");
			expect(suggestions[0]!.code).toContain("require-corp");
			expect(suggestions[0]!.framework).toBe("generic");
		});

		it("generates comment-based guidance for remove-header findings", () => {
			const findings = [makeHeaderFinding("header-remove-x-powered-by", "x-powered-by")];
			const { suggestions } = remediateHeaders(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("Remove");
			expect(suggestions[0]!.code).toContain("X-Powered-By");
		});
	});

	it("generates suggestions for all frameworks without errors", () => {
		const findings = ALL_HEADER_IDS.map((id) => makeHeaderFinding(id, id));
		for (const framework of FRAMEWORKS) {
			const { suggestions, unsupported } = remediateHeaders(findings, framework, "typescript");
			expect(suggestions).toHaveLength(ALL_HEADER_IDS.length);
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
		const findings = [makeHeaderFinding("header-missing-hsts", "strict-transport-security")];
		const ts = remediateHeaders(findings, "express", "typescript");
		const js = remediateHeaders(findings, "express", "javascript");
		expect(ts.suggestions[0]!.language).toBe("typescript");
		expect(js.suggestions[0]!.language).toBe("javascript");
	});

	it("includes CSP starter policy for header-missing-csp", () => {
		const findings = [makeHeaderFinding("header-missing-csp", "content-security-policy")];
		const { suggestions } = remediateHeaders(findings, "express", "typescript");
		expect(suggestions[0]!.code).toContain("default-src 'self'");
		expect(suggestions[0]!.code).toContain("script-src 'self'");
		expect(suggestions[0]!.confidence).toBe("medium");
	});

	it("marks confidence correctly for different finding types", () => {
		const findings = [
			makeHeaderFinding("header-missing-hsts", "strict-transport-security"),
			makeHeaderFinding("header-missing-csp", "content-security-policy"),
			makeHeaderFinding("header-missing-permissions-policy", "permissions-policy"),
		];
		const { suggestions } = remediateHeaders(findings, "express", "typescript");
		expect(suggestions.find((s) => s.findingId === "header-missing-hsts")!.confidence).toBe(
			"medium",
		);
		expect(suggestions.find((s) => s.findingId === "header-missing-csp")!.confidence).toBe(
			"medium",
		);
		expect(
			suggestions.find((s) => s.findingId === "header-missing-permissions-policy")!.confidence,
		).toBe("medium");
	});
});
