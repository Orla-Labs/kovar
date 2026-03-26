import { describe, expect, it } from "vitest";
import { remediateAuth } from "../../../src/remediation/auth.js";
import type { Framework } from "../../../src/remediation/types.js";
import type { FindingCategory, SecurityFinding } from "../../../src/types/results.js";

function makeAuthFinding(
	id: string,
	category: FindingCategory = "authentication",
	url?: string,
): SecurityFinding {
	return {
		id,
		category,
		severity: "critical",
		message: `Auth issue at ${url ?? "unknown"}`,
		remediation: `Fix auth at ${url ?? "unknown"}`,
		url,
	};
}

const ALL_AUTH_IDS = [
	"auth-missing-authentication",
	"auth-redirect-based",
	"auth-error-info-leak",
] as const;

const FRAMEWORKS: Framework[] = ["express", "fastify", "next", "koa", "hono", "generic"];

describe("remediateAuth", () => {
	it("generates a suggestion for every known auth finding ID", () => {
		const findings = ALL_AUTH_IDS.map((id) =>
			makeAuthFinding(
				id,
				id === "auth-error-info-leak" ? "information-disclosure" : "authentication",
				"http://localhost/api",
			),
		);
		const { suggestions, unsupported } = remediateAuth(findings, "express", "typescript");
		expect(suggestions).toHaveLength(ALL_AUTH_IDS.length);
		expect(unsupported).toHaveLength(0);
	});

	it("tracks unsupported auth finding IDs", () => {
		const findings: SecurityFinding[] = [makeAuthFinding("auth-unknown-thing")];
		const { suggestions, unsupported } = remediateAuth(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toEqual(["auth-unknown-thing"]);
	});

	it("skips non-auth-prefixed findings", () => {
		const findings: SecurityFinding[] = [
			{
				id: "csrf-unprotected-endpoint",
				category: "access-control",
				severity: "critical",
				message: "CSRF issue",
				remediation: "Fix it",
			},
		];
		const { suggestions, unsupported } = remediateAuth(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toHaveLength(0);
	});

	it("includes URL in description when available", () => {
		const findings = [
			makeAuthFinding("auth-missing-authentication", "authentication", "http://localhost/api"),
		];
		const { suggestions } = remediateAuth(findings, "express", "typescript");
		expect(suggestions[0]!.description).toContain("http://localhost/api");
	});

	it("uses escapeStr for URL in descriptions", () => {
		const findings = [
			makeAuthFinding(
				"auth-missing-authentication",
				"authentication",
				'http://localhost/api?q="inject"',
			),
		];
		const { suggestions } = remediateAuth(findings, "express", "typescript");
		expect(suggestions[0]!.description).toContain('\\"inject\\"');
	});

	it("includes OWASP and MDN references", () => {
		const findings = [makeAuthFinding("auth-missing-authentication")];
		const { suggestions } = remediateAuth(findings, "express", "typescript");
		expect(suggestions[0]!.references.length).toBeGreaterThan(0);
		expect(suggestions[0]!.references.some((r) => r.includes("owasp.org"))).toBe(true);
		expect(suggestions[0]!.references.some((r) => r.includes("mozilla.org"))).toBe(true);
	});

	describe("express framework", () => {
		it("generates JWT middleware for auth-missing-authentication", () => {
			const findings = [makeAuthFinding("auth-missing-authentication")];
			const { suggestions } = remediateAuth(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("jwt");
			expect(suggestions[0]!.code).toContain("requireAuth");
			expect(suggestions[0]!.code).toContain("authorization");
			expect(suggestions[0]!.code).toContain("401");
			expect(suggestions[0]!.framework).toBe("express");
			expect(suggestions[0]!.filePath).toBe("middleware.ts");
		});

		it("includes type annotations for typescript", () => {
			const findings = [makeAuthFinding("auth-missing-authentication")];
			const { suggestions } = remediateAuth(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain(": Request");
		});

		it("omits type annotations for javascript", () => {
			const findings = [makeAuthFinding("auth-missing-authentication")];
			const { suggestions } = remediateAuth(findings, "express", "javascript");
			expect(suggestions[0]!.code).not.toContain(": Request");
		});

		it("generates redirect fix for auth-redirect-based", () => {
			const findings = [makeAuthFinding("auth-redirect-based")];
			const { suggestions } = remediateAuth(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("401");
			expect(suggestions[0]!.code).toContain("isAuthenticated");
		});

		it("generates error sanitization for auth-error-info-leak", () => {
			const findings = [makeAuthFinding("auth-error-info-leak", "information-disclosure")];
			const { suggestions } = remediateAuth(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("An error occurred");
			expect(suggestions[0]!.code).toContain("console.error");
		});
	});

	describe("fastify framework", () => {
		it("generates @fastify/auth and @fastify/jwt for auth-missing-authentication", () => {
			const findings = [makeAuthFinding("auth-missing-authentication")];
			const { suggestions } = remediateAuth(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("@fastify/auth");
			expect(suggestions[0]!.code).toContain("@fastify/jwt");
			expect(suggestions[0]!.code).toContain("jwtVerify");
			expect(suggestions[0]!.framework).toBe("fastify");
			expect(suggestions[0]!.filePath).toBe("plugins/security.ts");
		});

		it("generates redirect fix for auth-redirect-based", () => {
			const findings = [makeAuthFinding("auth-redirect-based")];
			const { suggestions } = remediateAuth(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("401");
			expect(suggestions[0]!.code).toContain("onRequest");
		});

		it("generates error handler for auth-error-info-leak", () => {
			const findings = [makeAuthFinding("auth-error-info-leak", "information-disclosure")];
			const { suggestions } = remediateAuth(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("setErrorHandler");
			expect(suggestions[0]!.code).toContain("An error occurred");
		});
	});

	describe("next framework", () => {
		it("generates NextAuth/getServerSession for auth-missing-authentication", () => {
			const findings = [makeAuthFinding("auth-missing-authentication")];
			const { suggestions } = remediateAuth(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain("getServerSession");
			expect(suggestions[0]!.code).toContain("next-auth");
			expect(suggestions[0]!.code).toContain("401");
			expect(suggestions[0]!.framework).toBe("next");
		});

		it("generates redirect fix for auth-redirect-based", () => {
			const findings = [makeAuthFinding("auth-redirect-based")];
			const { suggestions } = remediateAuth(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain("401");
			expect(suggestions[0]!.code).toContain("getServerSession");
		});
	});

	describe("koa framework", () => {
		it("generates JWT middleware for auth-missing-authentication", () => {
			const findings = [makeAuthFinding("auth-missing-authentication")];
			const { suggestions } = remediateAuth(findings, "koa", "typescript");
			expect(suggestions[0]!.code).toContain("jwt");
			expect(suggestions[0]!.code).toContain("ctx.get");
			expect(suggestions[0]!.code).toContain("Authorization");
			expect(suggestions[0]!.framework).toBe("koa");
		});
	});

	describe("hono framework", () => {
		it("generates JWT middleware for auth-missing-authentication", () => {
			const findings = [makeAuthFinding("auth-missing-authentication")];
			const { suggestions } = remediateAuth(findings, "hono", "typescript");
			expect(suggestions[0]!.code).toContain("hono/jwt");
			expect(suggestions[0]!.code).toContain("JWT_SECRET");
			expect(suggestions[0]!.framework).toBe("hono");
		});
	});

	describe("generic framework", () => {
		it("generates comment-based auth guidance", () => {
			const findings = [makeAuthFinding("auth-missing-authentication")];
			const { suggestions } = remediateAuth(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("Authorization");
			expect(suggestions[0]!.code).toContain("401");
			expect(suggestions[0]!.framework).toBe("generic");
		});

		it("generates redirect fix guidance for auth-redirect-based", () => {
			const findings = [makeAuthFinding("auth-redirect-based")];
			const { suggestions } = remediateAuth(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("401");
			expect(suggestions[0]!.code).toContain("403");
		});

		it("generates error sanitization guidance for auth-error-info-leak", () => {
			const findings = [makeAuthFinding("auth-error-info-leak", "information-disclosure")];
			const { suggestions } = remediateAuth(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("generic error messages");
			expect(suggestions[0]!.code).toContain("stack traces");
		});
	});

	it("generates suggestions for all frameworks without errors", () => {
		const findings = ALL_AUTH_IDS.map((id) =>
			makeAuthFinding(
				id,
				id === "auth-error-info-leak" ? "information-disclosure" : "authentication",
				"http://localhost/api",
			),
		);
		for (const framework of FRAMEWORKS) {
			const { suggestions, unsupported } = remediateAuth(findings, framework, "typescript");
			expect(suggestions).toHaveLength(ALL_AUTH_IDS.length);
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
		const findings = [makeAuthFinding("auth-missing-authentication")];
		const ts = remediateAuth(findings, "express", "typescript");
		const js = remediateAuth(findings, "express", "javascript");
		expect(ts.suggestions[0]!.language).toBe("typescript");
		expect(js.suggestions[0]!.language).toBe("javascript");
	});

	it("sets confidence correctly per finding type", () => {
		const findings = ALL_AUTH_IDS.map((id) =>
			makeAuthFinding(
				id,
				id === "auth-error-info-leak" ? "information-disclosure" : "authentication",
			),
		);
		const { suggestions } = remediateAuth(findings, "express", "typescript");
		expect(suggestions.find((s) => s.findingId === "auth-missing-authentication")!.confidence).toBe(
			"high",
		);
		expect(suggestions.find((s) => s.findingId === "auth-redirect-based")!.confidence).toBe(
			"medium",
		);
		expect(suggestions.find((s) => s.findingId === "auth-error-info-leak")!.confidence).toBe(
			"high",
		);
	});
});
