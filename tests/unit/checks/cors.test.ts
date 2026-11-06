import type { APIRequestContext } from "@playwright/test";
import { type Mock, describe, expect, it, vi } from "vitest";
import { checkCORS } from "../../../src/checks/cors.js";

interface MockFetchResponse {
	status?: () => number;
	headers?: () => Record<string, string>;
}

function makeRequest(
	fetchResponse?: Partial<MockFetchResponse> & { headers?: () => Record<string, string> },
): APIRequestContext {
	const defaultResponse = {
		status: () => 200,
		headers: () => ({}) as Record<string, string>,
	};
	const response = { ...defaultResponse, ...fetchResponse };
	return {
		fetch: vi.fn().mockResolvedValue(response),
	} as unknown as APIRequestContext;
}

describe("checkCORS", () => {
	it("returns no findings when CORS headers are absent", async () => {
		const request = makeRequest({ headers: () => ({}) });
		const findings = await checkCORS(request, "https://example.com/api");
		expect(findings).toHaveLength(0);
	});

	it("flags reflected evil origin as high", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-origin": "http://evil.com",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-reflected-origin");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("high");
		expect(f!.cweId).toBe("CWE-346");
		expect(f!.message).toContain("evil.com");
	});

	it("flags reflected origin with credentials as critical", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-origin": "http://evil.com",
				"access-control-allow-credentials": "true",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-reflected-origin");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("critical");
	});

	it("flags wildcard origin as high", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-origin": "*",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-wildcard-origin");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("high");
		expect(f!.cweId).toBe("CWE-942");
	});

	it("flags wildcard origin with credentials as critical", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-origin": "*",
				"access-control-allow-credentials": "true",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-wildcard-with-credentials");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("critical");
	});

	it("flags overly permissive methods", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-methods": "GET, POST, PUT, DELETE, PATCH",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-permissive-methods");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("medium");
		expect(f!.message).toContain("PUT");
		expect(f!.message).toContain("DELETE");
	});

	it("does not flag safe methods only", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-methods": "GET, POST",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-permissive-methods");
		expect(f).toBeUndefined();
	});

	it("flags wildcard allow-headers as high", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-headers": "*",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-permissive-headers");
		expect(f).toBeDefined();
		expect(f!.severity).toBe("high");
		expect(f!.cweId).toBe("CWE-942");
		expect(f!.message).toContain("Access-Control-Allow-Headers: *");
	});

	it("does not flag specific allow-headers", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-headers": "Content-Type, Authorization",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-permissive-headers");
		expect(f).toBeUndefined();
	});

	it("does not flag absent allow-headers", async () => {
		const request = makeRequest({
			headers: () => ({}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-permissive-headers");
		expect(f).toBeUndefined();
	});

	it("tests null origin bypass", async () => {
		const fetchMock = vi.fn();
		fetchMock.mockImplementation((_url: string, opts: { headers: Record<string, string> }) => {
			const origin = opts.headers.origin;
			if (origin === "null") {
				return Promise.resolve({
					status: () => 200,
					headers: () => ({
						"access-control-allow-origin": "null",
					}),
				});
			}
			return Promise.resolve({
				status: () => 200,
				headers: () => ({}),
			});
		});
		const request = { fetch: fetchMock } as unknown as APIRequestContext;
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-reflected-origin" && f.message.includes("null"));
		expect(f).toBeDefined();
	});

	it("uses custom dangerousOrigins", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation((_url: string, opts: { headers: Record<string, string> }) => {
				const origin = opts.headers.origin;
				return Promise.resolve({
					status: () => 200,
					headers: () => ({
						"access-control-allow-origin": origin,
					}),
				});
			});
		const request = { fetch: fetchMock } as unknown as APIRequestContext;
		const findings = await checkCORS(request, "https://example.com/api", {
			dangerousOrigins: ["http://attacker.com"],
		});
		const f = findings.find((f) => f.id === "cors-reflected-origin");
		expect(f).toBeDefined();
		expect(f!.message).toContain("attacker.com");
	});

	it("uses custom url option", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			status: () => 200,
			headers: () => ({}),
		});
		const request = { fetch: fetchMock } as unknown as APIRequestContext;
		await checkCORS(request, "https://example.com/default", {
			url: "https://example.com/custom",
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/custom",
			expect.objectContaining({ method: "OPTIONS" }),
		);
	});

	it("reports unreachable endpoints as a failing finding instead of passing silently", async () => {
		const request = {
			fetch: vi.fn().mockRejectedValue(new Error("Network error")),
		} as unknown as APIRequestContext;
		const findings = await checkCORS(request, "https://example.com/api");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.id).toBe("cors-check-error");
		expect(findings[0]?.severity).toBe("high");
	});

	it("detects broken allowlists that substring/suffix-match the target host", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation((_url: string, opts: { headers: Record<string, string> }) => {
				const origin = opts.headers.origin ?? "";
				const reflect = origin.includes("app.example.com") || origin.endsWith("example.com");
				return Promise.resolve({
					status: () => 200,
					headers: () =>
						reflect
							? {
									"access-control-allow-origin": origin,
									"access-control-allow-credentials": "true",
								}
							: {},
				});
			});
		const request = { fetch: fetchMock } as unknown as APIRequestContext;
		const findings = await checkCORS(request, "https://app.example.com/api");
		const reflected = findings.filter((f) => f.id === "cors-reflected-origin");
		expect(reflected.map((f) => f.severity)).toEqual(["critical", "critical"]);
	});

	it("detects reflection on the actual request when the preflight has no CORS headers", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementation(
				(_url: string, opts: { method: string; headers: Record<string, string> }) =>
					Promise.resolve({
						status: () => (opts.method === "OPTIONS" ? 404 : 200),
						headers: () =>
							opts.method === "GET" ? { "access-control-allow-origin": opts.headers.origin } : {},
					}),
			);
		const request = { fetch: fetchMock } as unknown as APIRequestContext;
		const findings = await checkCORS(request, "https://example.com/api");
		expect(findings.some((f) => f.id === "cors-reflected-origin")).toBe(true);
	});

	it("does not probe origins listed in trustedOrigins", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ status: () => 200, headers: () => ({}) });
		const request = { fetch: fetchMock } as unknown as APIRequestContext;
		await checkCORS(request, "https://example.com/api", {
			dangerousOrigins: ["null", "https://partner.example.org"],
			trustedOrigins: ["https://partner.example.org"],
		});
		const origins = fetchMock.mock.calls.map((c) => c[1].headers.origin);
		expect(origins).not.toContain("https://partner.example.org");
	});

	it("normalizes header names to lowercase", async () => {
		const request = makeRequest({
			headers: () => ({
				"Access-Control-Allow-Origin": "*",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		const f = findings.find((f) => f.id === "cors-wildcard-origin");
		expect(f).toBeDefined();
	});

	it("includes remediation on every finding", async () => {
		const request = makeRequest({
			headers: () => ({
				"access-control-allow-origin": "http://evil.com",
				"access-control-allow-credentials": "true",
				"access-control-allow-methods": "GET, PUT, DELETE",
			}),
		});
		const findings = await checkCORS(request, "https://example.com/api");
		expect(findings.length).toBeGreaterThan(0);
		for (const finding of findings) {
			expect(finding.remediation).toBeTruthy();
			expect(finding.category).toBe("access-control");
		}
	});
});
