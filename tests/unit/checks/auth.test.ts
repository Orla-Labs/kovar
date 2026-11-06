import type { APIRequestContext } from "@playwright/test";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";

// checkAuth never sends probes through the caller's request context (R1-A3). It opens an
// isolated context via `request.newContext()`, so the mocks below stand in for that context.
const pw = vi.hoisted(() => {
	const state = { isolated: null as unknown, newContext: null as unknown as Mock };
	state.newContext = vi.fn(async () => state.isolated);
	return state;
});

vi.mock("@playwright/test", () => {
	return {
		request: { newContext: (...args: unknown[]) => pw.newContext(...args) },
		test: {
			info: () => {
				throw new Error("not inside a test");
			},
		},
	};
});

import { checkAuth } from "../../../src/checks/auth.js";

/** Returns the caller's context; the isolated context the check really uses gets the same fetch mock. */
function makeRequest(overrides: Partial<Record<string, Mock>> = {}): APIRequestContext {
	const defaults = {
		fetch: vi.fn().mockResolvedValue({
			status: () => 401,
			headers: () => ({}),
			text: () => Promise.resolve("Unauthorized"),
		}),
	};
	pw.isolated = { ...defaults, ...overrides, dispose: vi.fn().mockResolvedValue(undefined) };
	return { fetch: vi.fn() } as unknown as APIRequestContext;
}

beforeEach(() => {
	pw.newContext.mockClear();
	pw.newContext.mockImplementation(async () => pw.isolated);
});

describe("checkAuth isolation (R1-A3)", () => {
	it("never sends probes through the caller's (possibly logged-in) request context", async () => {
		const caller = makeRequest();
		await checkAuth(caller, "https://example.com/api/admin", { methods: ["GET"] });
		expect((caller as unknown as { fetch: Mock }).fetch).not.toHaveBeenCalled();
		expect((pw.isolated as { fetch: Mock }).fetch).toHaveBeenCalledTimes(1);
	});

	it("creates the isolated context without storageState, extra headers or credentials", async () => {
		makeRequest();
		await checkAuth({} as APIRequestContext, "/api/admin", {
			methods: ["GET"],
			baseURL: "https://example.com",
		});
		expect(pw.newContext).toHaveBeenCalledTimes(1);
		const opts = pw.newContext.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(opts.baseURL).toBe("https://example.com");
		// Keys must be PRESENT: Playwright's runner fills absent keys from the project's `use`.
		expect(opts).toHaveProperty("storageState", { cookies: [], origins: [] });
		expect(opts).toHaveProperty("extraHTTPHeaders", {});
		expect("httpCredentials" in opts).toBe(true);
		expect(opts.httpCredentials).toBeUndefined();
	});

	it("disposes the isolated context", async () => {
		makeRequest();
		await checkAuth({} as APIRequestContext, "https://example.com/a", { methods: ["GET"] });
		expect((pw.isolated as { dispose: Mock }).dispose).toHaveBeenCalledTimes(1);
	});

	it("reports could-not-run when the isolated context cannot be created", async () => {
		makeRequest();
		pw.newContext.mockRejectedValueOnce(new Error("boom"));
		const findings = await checkAuth({} as APIRequestContext, "https://example.com/a");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.id).toBe("auth-check-error");
		expect(findings[0]?.severity).toBe("high");
	});
});

describe("checkAuth", () => {
	it("returns no findings when endpoint returns 401", async () => {
		const request = makeRequest();
		const findings = await checkAuth(request, "https://example.com/api/admin");
		const critical = findings.filter((f) => f.severity === "critical");
		expect(critical).toHaveLength(0);
	});

	it("returns no findings when endpoint returns 403", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 403,
				headers: () => ({}),
				text: () => Promise.resolve("Forbidden"),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		const critical = findings.filter((f) => f.severity === "critical");
		expect(critical).toHaveLength(0);
	});

	it("flags endpoint returning 200 without auth as critical", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				text: () => Promise.resolve("{}"),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		const f = findings.find((f) => f.id === "auth-missing-authentication");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("critical");
		expect(f!.cweId).toBe("CWE-306");
		expect(f!.message).toContain("200");
	});

	it("flags redirect-based auth as info", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 302,
				headers: () => ({ location: "/login" }),
				text: () => Promise.resolve(""),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		const f = findings.find((f) => f.id === "auth-redirect-based");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("info");
		expect(f!.cweId).toBe("CWE-284");
	});

	it("flags 301 redirect as info", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 301,
				headers: () => ({ location: "/login" }),
				text: () => Promise.resolve(""),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		const f = findings.find((f) => f.id === "auth-redirect-based");
		expect(f).toBeDefined();
	});

	it("flags sensitive info leak in 401 response body", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 401,
				headers: () => ({}),
				text: () =>
					Promise.resolve(
						'{"error": "Invalid password for user admin", "api_key": "should not be here"}',
					),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		const f = findings.find((f) => f.id === "auth-error-info-leak");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("medium");
		expect(f!.category).toBe("information-disclosure");
	});

	it("flags sensitive info leak in 403 response body", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 403,
				headers: () => ({}),
				text: () => Promise.resolve("Access denied. Your secret token is invalid."),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		const f = findings.find((f) => f.id === "auth-error-info-leak");
		expect(f).toBeDefined();
	});

	it("does not flag clean 401 response body", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 401,
				headers: () => ({}),
				text: () => Promise.resolve("Authentication required"),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		const f = findings.find((f) => f.id === "auth-error-info-leak");
		expect(f).toBeUndefined();
	});

	it("tests multiple methods", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				text: () => Promise.resolve("{}"),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin", {
			methods: ["GET", "POST", "DELETE"],
		});
		const unprotected = findings.filter((f) => f.id === "auth-missing-authentication");
		expect(unprotected).toHaveLength(3);
		expect(unprotected[0]!.message).toContain("GET");
		expect(unprotected[1]!.message).toContain("POST");
		expect(unprotected[2]!.message).toContain("DELETE");
	});

	it("tests multiple endpoints", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				text: () => Promise.resolve("{}"),
			}),
		});
		const findings = await checkAuth(request, "https://example.com", {
			endpoints: ["https://example.com/api/users", "https://example.com/api/admin"],
		});
		const unprotected = findings.filter((f) => f.id === "auth-missing-authentication");
		expect(unprotected).toHaveLength(8);
	});

	it("uses default methods (GET, POST, PUT, DELETE) when none specified", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			status: () => 401,
			headers: () => ({}),
			text: () => Promise.resolve("Unauthorized"),
		});
		const request = makeRequest({ fetch: fetchMock });
		await checkAuth(request, "https://example.com/api/admin");
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/api/admin",
			expect.objectContaining({ method: "GET" }),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/api/admin",
			expect.objectContaining({ method: "POST" }),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/api/admin",
			expect.objectContaining({ method: "PUT" }),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/api/admin",
			expect.objectContaining({ method: "DELETE" }),
		);
	});

	it("reports network errors as a failing finding instead of passing silently", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockRejectedValue(new Error("Network error")),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin", {
			methods: ["GET"],
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.id).toBe("auth-check-error");
		expect(findings[0]?.severity).toBe("high");
	});

	it("does not follow redirects, so a 302 to a login page is not read as a 200", async () => {
		const fetch = vi.fn().mockResolvedValue({ status: () => 302, text: async () => "" });
		const request = makeRequest({ fetch });
		await checkAuth(request, "https://example.com/account", { methods: ["GET"] });
		expect(fetch).toHaveBeenCalledWith(
			"https://example.com/account",
			expect.objectContaining({ maxRedirects: 0 }),
		);
	});

	it("detects various sensitive patterns in error responses", async () => {
		const sensitiveResponses = [
			"Invalid password",
			"Bad secret value",
			"Missing api_key",
			"Invalid token provided",
			"private_key not found",
			"credit card required",
		];
		for (const body of sensitiveResponses) {
			const request = makeRequest({
				fetch: vi.fn().mockResolvedValue({
					status: () => 401,
					headers: () => ({}),
					text: () => Promise.resolve(body),
				}),
			});
			const findings = await checkAuth(request, "https://example.com/api");
			const f = findings.find((f) => f.id === "auth-error-info-leak");
			expect(f, `Should detect sensitive pattern in: "${body}"`).toBeDefined();
		}
	});

	it("includes url on every finding", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				text: () => Promise.resolve("{}"),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		for (const finding of findings) {
			expect(finding.url).toBe("https://example.com/api/admin");
		}
	});

	it("includes remediation on every finding", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				text: () => Promise.resolve('{"password": "leaked"}'),
			}),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		expect(findings.length).toBeGreaterThan(0);
		for (const finding of findings) {
			expect(finding.remediation).toBeTruthy();
		}
	});
});
