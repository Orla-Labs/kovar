import { describe, expect, it } from "vitest";
import { remediateCookies } from "../../../src/remediation/cookies.js";
import type { Framework } from "../../../src/remediation/types.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function makeCookieFinding(id: string, cookie: string): SecurityFinding {
	return {
		id,
		category: "cookies",
		severity: "high",
		cookie,
		message: `${cookie} issue`,
		remediation: `Fix ${cookie}`,
	};
}

const ALL_COOKIE_IDS = [
	"cookie-missing-secure",
	"cookie-missing-httponly",
	"cookie-samesite-none",
	"cookie-excessive-expiry",
	"cookie-broad-path",
	"cookie-invalid-host-prefix",
	"cookie-invalid-secure-prefix",
] as const;

const FRAMEWORKS: Framework[] = ["express", "fastify", "next", "koa", "hono", "generic"];

describe("remediateCookies", () => {
	it("generates a suggestion for every known cookie finding ID", () => {
		const findings = ALL_COOKIE_IDS.map((id) => makeCookieFinding(id, "session"));
		const { suggestions, unsupported } = remediateCookies(findings, "express", "typescript");
		expect(suggestions).toHaveLength(ALL_COOKIE_IDS.length);
		expect(unsupported).toHaveLength(0);
	});

	it("tracks unsupported cookie finding IDs", () => {
		const findings: SecurityFinding[] = [makeCookieFinding("cookie-unknown-thing", "unknown")];
		const { suggestions, unsupported } = remediateCookies(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toEqual(["cookie-unknown-thing"]);
	});

	it("generates suggestions for cookie prefix findings", () => {
		const findings: SecurityFinding[] = [
			makeCookieFinding("cookie-invalid-host-prefix", "__Host-session"),
			makeCookieFinding("cookie-invalid-secure-prefix", "__Secure-token"),
		];
		const { suggestions, unsupported } = remediateCookies(findings, "express", "typescript");
		expect(suggestions).toHaveLength(2);
		expect(unsupported).toHaveLength(0);
		expect(suggestions[0]!.confidence).toBe("high");
		expect(suggestions[1]!.confidence).toBe("high");
	});

	it("skips non-cookie findings", () => {
		const findings: SecurityFinding[] = [
			{
				id: "header-missing-hsts",
				category: "headers",
				severity: "critical",
				message: "Missing HSTS",
				remediation: "Fix it",
			},
		];
		const { suggestions, unsupported } = remediateCookies(findings, "express", "typescript");
		expect(suggestions).toHaveLength(0);
		expect(unsupported).toHaveLength(0);
	});

	describe("express framework", () => {
		it("generates session config for cookie-missing-secure", () => {
			const findings = [makeCookieFinding("cookie-missing-secure", "session")];
			const { suggestions } = remediateCookies(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("session(");
			expect(suggestions[0]!.code).toContain("secure: true");
		});

		it("generates session config for cookie-missing-httponly", () => {
			const findings = [makeCookieFinding("cookie-missing-httponly", "session")];
			const { suggestions } = remediateCookies(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain("httpOnly: true");
		});

		it("generates session config for cookie-samesite-none", () => {
			const findings = [makeCookieFinding("cookie-samesite-none", "session")];
			const { suggestions } = remediateCookies(findings, "express", "typescript");
			expect(suggestions[0]!.code).toContain('sameSite: "lax"');
		});
	});

	describe("fastify framework", () => {
		it("generates cookie plugin config", () => {
			const findings = [makeCookieFinding("cookie-missing-secure", "session")];
			const { suggestions } = remediateCookies(findings, "fastify", "typescript");
			expect(suggestions[0]!.code).toContain("fastify.register(cookie");
			expect(suggestions[0]!.code).toContain("secure: true");
		});
	});

	describe("next framework", () => {
		it("generates cookies().set() call", () => {
			const findings = [makeCookieFinding("cookie-missing-httponly", "session")];
			const { suggestions } = remediateCookies(findings, "next", "typescript");
			expect(suggestions[0]!.code).toContain("cookies().set(");
			expect(suggestions[0]!.code).toContain("httpOnly: true");
		});
	});

	describe("koa framework", () => {
		it("generates ctx.cookies.set() call", () => {
			const findings = [makeCookieFinding("cookie-samesite-none", "session")];
			const { suggestions } = remediateCookies(findings, "koa", "typescript");
			expect(suggestions[0]!.code).toContain("ctx.cookies.set(");
			expect(suggestions[0]!.code).toContain('sameSite: "lax"');
		});
	});

	describe("hono framework", () => {
		it("generates setCookie() call", () => {
			const findings = [makeCookieFinding("cookie-missing-secure", "session")];
			const { suggestions } = remediateCookies(findings, "hono", "typescript");
			expect(suggestions[0]!.code).toContain("setCookie(c,");
			expect(suggestions[0]!.code).toContain("secure: true");
		});
	});

	describe("generic framework", () => {
		it("generates Set-Cookie comment", () => {
			const findings = [makeCookieFinding("cookie-missing-secure", "session")];
			const { suggestions } = remediateCookies(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("Set-Cookie");
			expect(suggestions[0]!.code).toContain("Secure");
		});

		it("generates HttpOnly in Set-Cookie comment", () => {
			const findings = [makeCookieFinding("cookie-missing-httponly", "session")];
			const { suggestions } = remediateCookies(findings, "generic", "typescript");
			expect(suggestions[0]!.code).toContain("HttpOnly");
		});
	});

	it("generates suggestions for all frameworks without errors", () => {
		const findings = ALL_COOKIE_IDS.map((id) => makeCookieFinding(id, "session"));
		for (const framework of FRAMEWORKS) {
			const { suggestions, unsupported } = remediateCookies(findings, framework, "typescript");
			expect(suggestions).toHaveLength(ALL_COOKIE_IDS.length);
			expect(unsupported).toHaveLength(0);
			for (const suggestion of suggestions) {
				expect(suggestion.code).toBeTruthy();
				expect(suggestion.description).toBeTruthy();
				expect(suggestion.references.length).toBeGreaterThan(0);
			}
		}
	});

	it("respects the language option", () => {
		const findings = [makeCookieFinding("cookie-missing-secure", "session")];
		const ts = remediateCookies(findings, "express", "typescript");
		const js = remediateCookies(findings, "express", "javascript");
		expect(ts.suggestions[0]!.language).toBe("typescript");
		expect(js.suggestions[0]!.language).toBe("javascript");
	});

	it("sets confidence correctly per finding type", () => {
		const findings = [
			makeCookieFinding("cookie-missing-secure", "session"),
			makeCookieFinding("cookie-excessive-expiry", "session"),
			makeCookieFinding("cookie-broad-path", "session"),
		];
		const { suggestions } = remediateCookies(findings, "express", "typescript");
		expect(suggestions.find((s) => s.findingId === "cookie-missing-secure")!.confidence).toBe(
			"high",
		);
		expect(suggestions.find((s) => s.findingId === "cookie-excessive-expiry")!.confidence).toBe(
			"medium",
		);
		expect(suggestions.find((s) => s.findingId === "cookie-broad-path")!.confidence).toBe("low");
	});
});
