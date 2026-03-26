import { describe, expect, it } from "vitest";
import { remediateCORS } from "../../../src/remediation/cors.js";
import type { Framework } from "../../../src/remediation/types.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function makeCORSFinding(id: string, url?: string): SecurityFinding {
	return {
		id,
		category: "access-control",
		severity: "high",
		message: `CORS issue at ${url ?? "unknown"}`,
		remediation: `Fix CORS at ${url ?? "unknown"}`,
		url,
		cweId: "CWE-942",
	};
}

const ALL_CORS_IDS = [
	"cors-reflected-origin",
	"cors-wildcard-origin",
	"cors-wildcard-with-credentials",
	"cors-permissive-methods",
	"cors-permissive-headers",
] as const;

const FRAMEWORKS: Framework[] = ["express", "fastify", "next", "koa", "hono", "generic"];

describe("remediateCORS", () => {
	it("generates a suggestion for every known CORS finding ID", () => {
		const findings = ALL_CORS_IDS.map((id) => makeCORSFinding(id, "http://localhost/api"));
		const { suggestions, unsupported } = remediateCORS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(ALL_CORS_IDS.length);
		expect(unsupported).toHaveLength(0);
	});

	it("tracks unsupported CORS finding IDs", () => {
		const findings: SecurityFinding[] = [makeCORSFinding("cors-unknown-thing")];
		const { suggestions, unsupported } = remediateCORS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toEqual(["cors-unknown-thing"]);
	});

	it("skips non-cors-prefixed findings", () => {
		const findings: SecurityFinding[] = [
			{
				id: "csrf-unprotected-endpoint",
				category: "access-control",
				severity: "critical",
				message: "CSRF issue",
				remediation: "Fix it",
			},
		];
		const { suggestions, unsupported } = remediateCORS(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toHaveLength(0);
	});

	it("includes URL in description when available", () => {
		const findings = [makeCORSFinding("cors-reflected-origin", "http://localhost/api")];
		const { suggestions } = remediateCORS(findings, "express", "typescript");
		expect(suggestions[0]!.description).toContain("http://localhost/api");
	});

	it("uses escapeStr for URL in descriptions", () => {
		const findings = [makeCORSFinding("cors-reflected-origin", 'http://localhost/api?q="inject"')];
		const { suggestions } = remediateCORS(findings, "express", "typescript");
		expect(suggestions[0]!.description).toContain('\\"inject\\"');
	});

	it("includes OWASP and MDN references", () => {
		const findings = [makeCORSFinding("cors-reflected-origin")];
		const { suggestions } = remediateCORS(findings, "express", "typescript");
		expect(suggestions[0]!.references.length).toBeGreaterThan(0);
		expect(suggestions[0]!.references.some((r) => r.includes("owasp.org"))).toBe(true);
		expect(suggestions[0]!.references.some((r) => r.includes("mozilla.org"))).toBe(true);
	});

	describe("express framework", () => {
		it("generates cors() with origin allowlist for cors-reflected-origin", () => {
			const findings = [makeCORSFinding("cors-reflected-origin")];
			const { suggestions } = remediateCORS(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain('import cors from "cors"');
			expect(suggestions[0]!.code).toContain("allowedOrigins");
			expect(suggestions[0]!.code).toContain("credentials: true");
			expect(suggestions[0]!.framework).toBe("express");
			expect(suggestions[0]!.filePath).toBe("middleware.ts");
		});

		it("generates same allowlist for cors-wildcard-origin", () => {
			const findings = [makeCORSFinding("cors-wildcard-origin")];
			const { suggestions } = remediateCORS(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("allowedOrigins");
		});

		it("generates same allowlist for cors-wildcard-with-credentials", () => {
			const findings = [makeCORSFinding("cors-wildcard-with-credentials")];
			const { suggestions } = remediateCORS(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("allowedOrigins");
			expect(suggestions[0]!.code).toContain("credentials: true");
		});

		it("generates methods restriction for cors-permissive-methods", () => {
			const findings = [makeCORSFinding("cors-permissive-methods")];
			const { suggestions } = remediateCORS(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain('methods: ["GET", "POST"]');
		});

		it("generates headers restriction for cors-permissive-headers", () => {
			const findings = [makeCORSFinding("cors-permissive-headers")];
			const { suggestions } = remediateCORS(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("allowedHeaders");
			expect(suggestions[0]!.code).toContain("Content-Type");
			expect(suggestions[0]!.code).toContain("Authorization");
		});
	});

	describe("fastify framework", () => {
		it("generates @fastify/cors with origin allowlist", () => {
			const findings = [makeCORSFinding("cors-reflected-origin")];
			const { suggestions } = remediateCORS(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("@fastify/cors");
			expect(suggestions[0]!.code).toContain("allowedOrigins");
			expect(suggestions[0]!.framework).toBe("fastify");
			expect(suggestions[0]!.filePath).toBe("plugins/security.ts");
		});

		it("generates methods restriction", () => {
			const findings = [makeCORSFinding("cors-permissive-methods")];
			const { suggestions } = remediateCORS(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain('methods: ["GET", "POST"]');
		});

		it("generates headers restriction", () => {
			const findings = [makeCORSFinding("cors-permissive-headers")];
			const { suggestions } = remediateCORS(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("allowedHeaders");
		});
	});

	describe("next framework", () => {
		it("generates middleware with origin validation", () => {
			const findings = [makeCORSFinding("cors-reflected-origin")];
			const { suggestions } = remediateCORS(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain("allowedOrigins");
			expect(suggestions[0]!.code).toContain("middleware");
			expect(suggestions[0]!.code).toContain("Access-Control-Allow-Origin");
			expect(suggestions[0]!.framework).toBe("next");
		});

		it("generates method restriction", () => {
			const findings = [makeCORSFinding("cors-permissive-methods")];
			const { suggestions } = remediateCORS(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain("allowedMethods");
		});
	});

	describe("koa framework", () => {
		it("generates @koa/cors with origin function", () => {
			const findings = [makeCORSFinding("cors-reflected-origin")];
			const { suggestions } = remediateCORS(findings, "koa", "typescript");
			expect(suggestions[0]!.code).toContain("@koa/cors");
			expect(suggestions[0]!.code).toContain("allowedOrigins");
			expect(suggestions[0]!.framework).toBe("koa");
		});
	});

	describe("hono framework", () => {
		it("generates hono/cors with origin allowlist", () => {
			const findings = [makeCORSFinding("cors-reflected-origin")];
			const { suggestions } = remediateCORS(findings, "hono", "typescript");
			expect(suggestions[0]!.code).toContain("hono/cors");
			expect(suggestions[0]!.code).toContain("allowedOrigins");
			expect(suggestions[0]!.framework).toBe("hono");
		});
	});

	describe("generic framework", () => {
		it("generates comment-based origin allowlist guidance", () => {
			const findings = [makeCORSFinding("cors-reflected-origin")];
			const { suggestions } = remediateCORS(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("allowlist");
			expect(suggestions[0]!.code).toContain("NEVER reflect");
			expect(suggestions[0]!.framework).toBe("generic");
		});

		it("generates method restriction guidance", () => {
			const findings = [makeCORSFinding("cors-permissive-methods")];
			const { suggestions } = remediateCORS(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("Access-Control-Allow-Methods");
		});

		it("generates header restriction guidance", () => {
			const findings = [makeCORSFinding("cors-permissive-headers")];
			const { suggestions } = remediateCORS(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("Access-Control-Allow-Headers");
		});
	});

	it("generates suggestions for all frameworks without errors", () => {
		const findings = ALL_CORS_IDS.map((id) => makeCORSFinding(id, "http://localhost/api"));
		for (const framework of FRAMEWORKS) {
			const { suggestions, unsupported } = remediateCORS(findings, framework, "typescript");
			expect(suggestions).toHaveLength(ALL_CORS_IDS.length);
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
		const findings = [makeCORSFinding("cors-reflected-origin")];
		const ts = remediateCORS(findings, "express", "typescript");
		const js = remediateCORS(findings, "express", "javascript");
		expect(ts.suggestions[0]!.language).toBe("typescript");
		expect(js.suggestions[0]!.language).toBe("javascript");
	});

	it("sets confidence correctly per finding type", () => {
		const findings = ALL_CORS_IDS.map((id) => makeCORSFinding(id));
		const { suggestions } = remediateCORS(findings, "express", "typescript");
		const highConfidence = [
			"cors-reflected-origin",
			"cors-wildcard-origin",
			"cors-wildcard-with-credentials",
		];
		const mediumConfidence = ["cors-permissive-methods", "cors-permissive-headers"];
		for (const suggestion of suggestions) {
			if (highConfidence.includes(suggestion.findingId)) {
				expect(suggestion.confidence).toBe("high");
			} else if (mediumConfidence.includes(suggestion.findingId)) {
				expect(suggestion.confidence).toBe("medium");
			}
		}
	});
});
