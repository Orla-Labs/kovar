import { describe, expect, it } from "vitest";
import { type CookieInput, analyzeCookies } from "../../../src/checks/cookies.js";

// Note: session cookie patterns now use word boundaries.
// "inside" no longer matches /\bsid\b/i. "sessionId" matches /\bsess(ion)?\b/i.

function makeCookie(overrides: Partial<CookieInput> = {}): CookieInput {
	return {
		name: "session",
		value: "abc123",
		domain: "example.com",
		path: "/",
		expires: -1,
		httpOnly: true,
		secure: true,
		sameSite: "Strict",
		...overrides,
	};
}

describe("analyzeCookies", () => {
	it("returns no findings for a fully secure session cookie", () => {
		const findings = analyzeCookies([makeCookie()]);
		const serious = findings.filter((f) => f.severity === "critical" || f.severity === "high");
		expect(serious).toHaveLength(0);
	});

	it("flags missing Secure flag as critical for session cookies", () => {
		const findings = analyzeCookies([makeCookie({ secure: false })]);
		const f = findings.find((f) => f.id === "cookie-missing-secure");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("critical");
	});

	it("flags missing Secure flag as medium for non-session cookies", () => {
		const findings = analyzeCookies([makeCookie({ name: "theme", secure: false })]);
		const f = findings.find((f) => f.id === "cookie-missing-secure");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("medium");
	});

	it("flags missing HttpOnly on session cookies", () => {
		const findings = analyzeCookies([makeCookie({ httpOnly: false })]);
		const f = findings.find((f) => f.id === "cookie-missing-httponly");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("critical");
	});

	it("does not flag missing HttpOnly on non-session cookies", () => {
		const findings = analyzeCookies([makeCookie({ name: "theme", httpOnly: false })]);
		const f = findings.find((f) => f.id === "cookie-missing-httponly");
		expect(f).toBeUndefined();
	});

	it("flags SameSite=None", () => {
		const findings = analyzeCookies([makeCookie({ sameSite: "None" })]);
		const f = findings.find((f) => f.id === "cookie-samesite-none");
		expect(f).toBeDefined();
	});

	it("allows SameSite=None when explicitly permitted", () => {
		const findings = analyzeCookies([makeCookie({ sameSite: "None" })], {
			allowSameSiteNone: ["session"],
		});
		const f = findings.find((f) => f.id === "cookie-samesite-none");
		expect(f).toBeUndefined();
	});

	it("flags excessive expiry on session cookies", () => {
		const farFuture = Date.now() / 1000 + 400 * 86400;
		const findings = analyzeCookies([makeCookie({ expires: farFuture })]);
		const f = findings.find((f) => f.id === "cookie-excessive-expiry");
		expect(f).toBeDefined();
	});

	it("flags broad path on session cookies", () => {
		const findings = analyzeCookies([makeCookie({ path: "/" })]);
		const f = findings.find((f) => f.id === "cookie-broad-path");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("low");
	});

	it("flags invalid __Host- prefix", () => {
		const findings = analyzeCookies([makeCookie({ name: "__Host-session", secure: false })]);
		const f = findings.find((f) => f.id === "cookie-invalid-host-prefix");
		expect(f).toBeDefined();
	});

	it("accepts valid __Host- prefix", () => {
		const findings = analyzeCookies([
			makeCookie({
				name: "__Host-session",
				secure: true,
				path: "/",
				domain: "",
			}),
		]);
		const f = findings.find((f) => f.id === "cookie-invalid-host-prefix");
		expect(f).toBeUndefined();
	});

	it("flags invalid __Secure- prefix without Secure flag", () => {
		const findings = analyzeCookies([makeCookie({ name: "__Secure-token", secure: false })]);
		const f = findings.find((f) => f.id === "cookie-invalid-secure-prefix");
		expect(f).toBeDefined();
	});

	it("detects session cookies by pattern", () => {
		const sessionNames = [
			"sessionId",
			"auth_token",
			"csrf_token",
			"jwt",
			"user_sid",
			"login_state",
		];
		for (const name of sessionNames) {
			const findings = analyzeCookies([makeCookie({ name, httpOnly: false })]);
			const f = findings.find((f) => f.id === "cookie-missing-httponly");
			expect(f, `${name} should be detected as session cookie`).toBeDefined();
		}
	});

	it("does not false-positive on non-session cookie names", () => {
		const nonSessionNames = ["inside", "subsidy", "consideration", "tokenizer"];
		for (const name of nonSessionNames) {
			const findings = analyzeCookies([makeCookie({ name, httpOnly: false })]);
			const f = findings.find((f) => f.id === "cookie-missing-httponly");
			expect(f, `${name} should NOT be detected as session cookie`).toBeUndefined();
		}
	});

	it("respects skip option", () => {
		const findings = analyzeCookies([makeCookie({ secure: false })], { skip: ["session"] });
		expect(findings).toHaveLength(0);
	});

	it("respects custom session cookie patterns", () => {
		const findings = analyzeCookies([makeCookie({ name: "my_custom_id", httpOnly: false })], {
			sessionCookiePatterns: [/custom/i],
		});
		const f = findings.find((f) => f.id === "cookie-missing-httponly");
		expect(f).toBeDefined();
	});

	it("includes remediation on every finding", () => {
		const findings = analyzeCookies([
			makeCookie({ secure: false, httpOnly: false, sameSite: "None" }),
		]);
		for (const finding of findings) {
			expect(finding.remediation).toBeTruthy();
			expect(finding.category).toBe("cookies");
		}
	});
});
