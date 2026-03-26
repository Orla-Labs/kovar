import type { APIRequestContext } from "@playwright/test";
import { type Mock, describe, expect, it, vi } from "vitest";
import { checkAuth } from "../../../src/checks/auth.js";

function makeRequest(overrides: Partial<Record<string, Mock>> = {}): APIRequestContext {
	const defaults = {
		fetch: vi.fn().mockResolvedValue({
			status: () => 401,
			headers: () => ({}),
			text: () => Promise.resolve("Unauthorized"),
		}),
	};
	return { ...defaults, ...overrides } as unknown as APIRequestContext;
}

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

	it("handles network errors gracefully", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockRejectedValue(new Error("Network error")),
		});
		const findings = await checkAuth(request, "https://example.com/api/admin");
		expect(findings).toHaveLength(0);
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
