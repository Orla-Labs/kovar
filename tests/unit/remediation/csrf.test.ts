import { describe, expect, it } from "vitest";
import { remediateCSRF } from "../../../src/remediation/csrf.js";
import type { Framework } from "../../../src/remediation/types.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function makeCSRFFinding(id: string, url?: string): SecurityFinding {
	return {
		id,
		category: "access-control",
		severity: "critical",
		message: `CSRF issue at ${url ?? "unknown"}`,
		remediation: `Fix CSRF at ${url ?? "unknown"}`,
		url,
		cweId: "CWE-352",
	};
}

const ALL_CSRF_IDS = [
	"csrf-unprotected-endpoint",
	"csrf-no-token-in-response",
	"csrf-weak-samesite",
] as const;

const FRAMEWORKS: Framework[] = ["express", "fastify", "next", "koa", "hono", "generic"];

describe("remediateCSRF", () => {
	it("generates a suggestion for every known CSRF finding ID", () => {
		const findings = ALL_CSRF_IDS.map((id) => makeCSRFFinding(id, "http://localhost/api"));
		const { suggestions, unsupported } = remediateCSRF(findings, "express", "typescript");
		expect(suggestions).toHaveLength(ALL_CSRF_IDS.length);
		expect(unsupported).toHaveLength(0);
	});

	it("tracks unsupported CSRF finding IDs", () => {
		const findings: SecurityFinding[] = [makeCSRFFinding("csrf-unknown-thing")];
		const { suggestions, unsupported } = remediateCSRF(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toEqual(["csrf-unknown-thing"]);
	});

	it("skips non-csrf-prefixed findings", () => {
		const findings: SecurityFinding[] = [
			{
				id: "cors-wildcard-origin",
				category: "access-control",
				severity: "high",
				message: "CORS wildcard",
				remediation: "Fix it",
			},
		];
		const { suggestions, unsupported } = remediateCSRF(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toHaveLength(0);
	});

	it("includes URL in description when available", () => {
		const findings = [makeCSRFFinding("csrf-unprotected-endpoint", "http://localhost/api")];
		const { suggestions } = remediateCSRF(findings, "express", "typescript");
		expect(suggestions[0]!.description).toContain("http://localhost/api");
	});

	it("uses escapeStr for URL in descriptions", () => {
		const findings = [
			makeCSRFFinding("csrf-unprotected-endpoint", 'http://localhost/api?q="inject"'),
		];
		const { suggestions } = remediateCSRF(findings, "express", "typescript");
		expect(suggestions[0]!.description).toContain('\\"inject\\"');
	});

	it("includes OWASP and MDN references", () => {
		const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
		const { suggestions } = remediateCSRF(findings, "express", "typescript");
		expect(suggestions[0]!.references.length).toBeGreaterThan(0);
		expect(suggestions[0]!.references.some((r) => r.includes("owasp.org"))).toBe(true);
		expect(suggestions[0]!.references.some((r) => r.includes("mozilla.org"))).toBe(true);
	});

	describe("express framework", () => {
		it("generates csurf middleware for csrf-unprotected-endpoint", () => {
			const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
			const { suggestions } = remediateCSRF(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("csurf");
			expect(suggestions[0]!.code).toContain("csrf({ cookie: true })");
			expect(suggestions[0]!.code).toContain("csrfToken");
			expect(suggestions[0]!.framework).toBe("express");
			expect(suggestions[0]!.filePath).toBe("middleware.ts");
		});

		it("generates token injection for csrf-no-token-in-response", () => {
			const findings = [makeCSRFFinding("csrf-no-token-in-response")];
			const { suggestions } = remediateCSRF(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("csrfToken");
			expect(suggestions[0]!.code).toContain("res.locals");
		});

		it("generates SameSite fix for csrf-weak-samesite", () => {
			const findings = [makeCSRFFinding("csrf-weak-samesite")];
			const { suggestions } = remediateCSRF(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain('sameSite: "strict"');
			expect(suggestions[0]!.code).toContain("secure: true");
		});
	});

	describe("fastify framework", () => {
		it("generates @fastify/csrf-protection for csrf-unprotected-endpoint", () => {
			const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
			const { suggestions } = remediateCSRF(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("@fastify/csrf-protection");
			expect(suggestions[0]!.code).toContain("@fastify/cookie");
			expect(suggestions[0]!.framework).toBe("fastify");
			expect(suggestions[0]!.filePath).toBe("plugins/security.ts");
		});

		it("generates token header for csrf-no-token-in-response", () => {
			const findings = [makeCSRFFinding("csrf-no-token-in-response")];
			const { suggestions } = remediateCSRF(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("generateCsrf");
			expect(suggestions[0]!.code).toContain("x-csrf-token");
		});

		it("generates SameSite fix for csrf-weak-samesite", () => {
			const findings = [makeCSRFFinding("csrf-weak-samesite")];
			const { suggestions } = remediateCSRF(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain('sameSite: "strict"');
		});
	});

	describe("next framework", () => {
		it("generates CSRF middleware for csrf-unprotected-endpoint", () => {
			const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
			const { suggestions } = remediateCSRF(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain("x-csrf-token");
			expect(suggestions[0]!.code).toContain("verify");
			expect(suggestions[0]!.framework).toBe("next");
		});

		it("generates getServerSideProps token for csrf-no-token-in-response", () => {
			const findings = [makeCSRFFinding("csrf-no-token-in-response")];
			const { suggestions } = remediateCSRF(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain("getServerSideProps");
			expect(suggestions[0]!.code).toContain("csrfToken");
		});
	});

	describe("koa framework", () => {
		it("generates koa-csrf middleware for csrf-unprotected-endpoint", () => {
			const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
			const { suggestions } = remediateCSRF(findings, "koa", "typescript");
			expect(suggestions[0]!.code).toContain("koa-csrf");
			expect(suggestions[0]!.code).toContain("CSRF");
			expect(suggestions[0]!.framework).toBe("koa");
		});
	});

	describe("hono framework", () => {
		it("generates custom CSRF middleware for csrf-unprotected-endpoint", () => {
			const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
			const { suggestions } = remediateCSRF(findings, "hono", "typescript");
			expect(suggestions[0]!.code).toContain("x-csrf-token");
			expect(suggestions[0]!.code).toContain("csrf-token");
			expect(suggestions[0]!.framework).toBe("hono");
		});
	});

	describe("generic framework", () => {
		it("generates comment-based CSRF guidance", () => {
			const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
			const { suggestions } = remediateCSRF(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("CSRF");
			expect(suggestions[0]!.code).toContain("token");
			expect(suggestions[0]!.framework).toBe("generic");
		});

		it("generates meta tag guidance for csrf-no-token-in-response", () => {
			const findings = [makeCSRFFinding("csrf-no-token-in-response")];
			const { suggestions } = remediateCSRF(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("csrf-token");
			expect(suggestions[0]!.code).toContain("meta");
		});

		it("generates SameSite guidance for csrf-weak-samesite", () => {
			const findings = [makeCSRFFinding("csrf-weak-samesite")];
			const { suggestions } = remediateCSRF(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("SameSite=Strict");
		});
	});

	it("generates suggestions for all frameworks without errors", () => {
		const findings = ALL_CSRF_IDS.map((id) => makeCSRFFinding(id, "http://localhost/api"));
		for (const framework of FRAMEWORKS) {
			const { suggestions, unsupported } = remediateCSRF(findings, framework, "typescript");
			expect(suggestions).toHaveLength(ALL_CSRF_IDS.length);
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
		const findings = [makeCSRFFinding("csrf-unprotected-endpoint")];
		const ts = remediateCSRF(findings, "express", "typescript");
		const js = remediateCSRF(findings, "express", "javascript");
		expect(ts.suggestions[0]!.language).toBe("typescript");
		expect(js.suggestions[0]!.language).toBe("javascript");
	});

	it("sets confidence correctly per finding type", () => {
		const findings = ALL_CSRF_IDS.map((id) => makeCSRFFinding(id));
		const { suggestions } = remediateCSRF(findings, "express", "typescript");
		for (const suggestion of suggestions) {
			expect(suggestion.confidence).toBe("high");
		}
	});
});
