import type { APIRequestContext } from "@playwright/test";
import { type Mock, describe, expect, it, vi } from "vitest";
import { checkCSRF } from "../../../src/checks/csrf.js";

function makeRequest(overrides: Partial<Record<string, Mock>> = {}): APIRequestContext {
	const defaults = {
		fetch: vi.fn().mockResolvedValue({
			status: () => 403,
			headers: () => ({}),
			headersArray: () => [],
			text: () => Promise.resolve(""),
		}),
		get: vi.fn().mockResolvedValue({
			status: () => 200,
			headers: () => ({}),
			headersArray: () => [],
			text: () => Promise.resolve("<html></html>"),
		}),
	};
	return { ...defaults, ...overrides } as unknown as APIRequestContext;
}

describe("checkCSRF", () => {
	it("returns no critical findings when endpoints reject requests without CSRF tokens", async () => {
		const request = makeRequest();
		const findings = await checkCSRF(request, "https://example.com/api/submit");
		const critical = findings.filter((f) => f.severity === "critical");
		expect(critical).toHaveLength(0);
	});

	it("flags endpoints that accept POST without CSRF token", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				headersArray: () => [],
				text: () => Promise.resolve(""),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/api/submit", {
			methods: ["POST"],
		});
		const f = findings.find((f) => f.id === "csrf-unprotected-endpoint");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("critical");
		expect(f!.cweId).toBe("CWE-352");
		expect(f!.message).toContain("POST");
	});

	it("flags all configured methods that return 2xx", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				headersArray: () => [],
				text: () => Promise.resolve(""),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/api", {
			methods: ["POST", "PUT", "DELETE"],
		});
		const unprotected = findings.filter((f) => f.id === "csrf-unprotected-endpoint");
		expect(unprotected).toHaveLength(3);
	});

	it("does not flag endpoints returning 403", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 403,
				headers: () => ({}),
				headersArray: () => [],
				text: () => Promise.resolve(""),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/api", {
			methods: ["POST"],
		});
		const unprotected = findings.filter((f) => f.id === "csrf-unprotected-endpoint");
		expect(unprotected).toHaveLength(0);
	});

	it("flags missing CSRF token in response", async () => {
		const request = makeRequest({
			get: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				headersArray: () => [],
				text: () => Promise.resolve("<html><body>No token here</body></html>"),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/form");
		const f = findings.find((f) => f.id === "csrf-no-token-in-response");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("medium");
	});

	it("does not flag when CSRF token header is present in response", async () => {
		const request = makeRequest({
			get: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({ "x-csrf-token": "abc123" }),
				headersArray: () => [{ name: "set-cookie", value: "sid=abc; SameSite=Strict" }],
				text: () => Promise.resolve("<html></html>"),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/form");
		const f = findings.find((f) => f.id === "csrf-no-token-in-response");
		expect(f).toBeUndefined();
	});

	it("does not flag when CSRF meta tag is present", async () => {
		const request = makeRequest({
			get: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				headersArray: () => [{ name: "set-cookie", value: "sid=abc; SameSite=Strict" }],
				text: () =>
					Promise.resolve('<html><head><meta name="csrf-token" content="abc123"></head></html>'),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/form");
		const f = findings.find((f) => f.id === "csrf-no-token-in-response");
		expect(f).toBeUndefined();
	});

	it("flags weak SameSite cookie settings", async () => {
		const request = makeRequest({
			get: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({ "x-csrf-token": "abc" }),
				headersArray: () => [{ name: "set-cookie", value: "sid=abc; SameSite=None; Secure" }],
				text: () => Promise.resolve("<html></html>"),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/form");
		const f = findings.find((f) => f.id === "csrf-weak-samesite");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("medium");
	});

	it("does not flag SameSite=Strict cookies", async () => {
		const request = makeRequest({
			get: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({ "x-csrf-token": "abc" }),
				headersArray: () => [{ name: "set-cookie", value: "sid=abc; SameSite=Strict" }],
				text: () => Promise.resolve("<html></html>"),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/form");
		const f = findings.find((f) => f.id === "csrf-weak-samesite");
		expect(f).toBeUndefined();
	});

	it("respects skip option", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				headersArray: () => [],
				text: () => Promise.resolve(""),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/api/public", {
			endpoints: ["https://example.com/api/public"],
			skip: ["/api/public"],
		});
		expect(findings).toHaveLength(0);
	});

	it("tests multiple endpoints", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				headersArray: () => [],
				text: () => Promise.resolve(""),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com", {
			endpoints: ["https://example.com/api/a", "https://example.com/api/b"],
			methods: ["POST"],
		});
		const unprotected = findings.filter((f) => f.id === "csrf-unprotected-endpoint");
		expect(unprotected).toHaveLength(2);
	});

	it("respects custom tokenHeaders option", async () => {
		const request = makeRequest({
			get: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({ "x-my-csrf": "abc123" }),
				headersArray: () => [{ name: "set-cookie", value: "sid=abc; SameSite=Strict" }],
				text: () => Promise.resolve("<html></html>"),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/form", {
			tokenHeaders: ["x-my-csrf"],
		});
		const f = findings.find((f) => f.id === "csrf-no-token-in-response");
		expect(f).toBeUndefined();
	});

	it("uses default methods when none specified", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			status: () => 403,
			headers: () => ({}),
			headersArray: () => [],
			text: () => Promise.resolve(""),
		});
		const request = makeRequest({ fetch: fetchMock });
		await checkCSRF(request, "https://example.com/api");
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it("handles network errors gracefully", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockRejectedValue(new Error("Network error")),
			get: vi.fn().mockRejectedValue(new Error("Network error")),
		});
		const findings = await checkCSRF(request, "https://example.com/api");
		expect(findings).toHaveLength(0);
	});

	it("includes remediation on every finding", async () => {
		const request = makeRequest({
			fetch: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				headersArray: () => [],
				text: () => Promise.resolve(""),
			}),
			get: vi.fn().mockResolvedValue({
				status: () => 200,
				headers: () => ({}),
				headersArray: () => [{ name: "set-cookie", value: "sid=abc; SameSite=None" }],
				text: () => Promise.resolve("<html></html>"),
			}),
		});
		const findings = await checkCSRF(request, "https://example.com/api", {
			methods: ["POST"],
		});
		for (const finding of findings) {
			expect(finding.remediation).toBeTruthy();
			expect(finding.category).toBe("access-control");
		}
	});
});
