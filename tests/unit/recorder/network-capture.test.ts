import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkCapture } from "../../../src/recorder/network-capture.js";

/**
 * Mock Playwright Request object for testing NetworkCapture.
 */
function createMockRequest(
	options: {
		url?: string;
		method?: string;
		resourceType?: string;
		headers?: Record<string, string>;
		postData?: string | null;
	} = {},
) {
	const req = {
		url: () => options.url ?? "https://api.example.com/data",
		method: () => options.method ?? "GET",
		resourceType: () => options.resourceType ?? "fetch",
		headers: () => options.headers ?? {},
		postData: () => options.postData ?? null,
	};
	return req;
}

/**
 * Mock Playwright Response object for testing NetworkCapture.
 */
function createMockResponse(
	request: ReturnType<typeof createMockRequest>,
	options: {
		status?: number;
		headers?: Record<string, string>;
		body?: string | null;
	} = {},
) {
	return {
		request: () => request,
		status: () => options.status ?? 200,
		headers: () => options.headers ?? {},
		text: vi.fn(async () => options.body ?? ""),
	};
}

/**
 * Creates a MockPage with event handling for NetworkCapture tests.
 */
function createNetworkMockPage() {
	const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

	return {
		on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
			const existing = handlers.get(event) ?? [];
			existing.push(handler);
			handlers.set(event, existing);
		}),
		triggerEvent: async (event: string, ...args: unknown[]) => {
			const eventHandlers = handlers.get(event) ?? [];
			for (const handler of eventHandlers) {
				await handler(...args);
			}
		},
	};
}

describe("NetworkCapture", () => {
	let capture: NetworkCapture;
	let page: ReturnType<typeof createNetworkMockPage>;

	beforeEach(() => {
		capture = new NetworkCapture();
		page = createNetworkMockPage();
	});

	async function attachAndCapture(
		requestOptions: Parameters<typeof createMockRequest>[0] = {},
		responseOptions: Parameters<typeof createMockResponse>[1] = {},
	) {
		await capture.attach(page as never);
		const request = createMockRequest(requestOptions);
		const response = createMockResponse(request, responseOptions);

		// Trigger the 'request' event first
		await page.triggerEvent("request", request);
		// Then trigger the 'response' event
		await page.triggerEvent("response", response);

		return { request, response };
	}

	describe("Request capture", () => {
		it("captures request on response event with correct URL, method, status, timing", async () => {
			await attachAndCapture(
				{ url: "https://api.example.com/users", method: "POST" },
				{ status: 201, body: '{"id": 1}' },
			);

			const requests = capture.getRequests();
			expect(requests).toHaveLength(1);
			expect(requests[0]?.url).toBe("https://api.example.com/users");
			expect(requests[0]?.method).toBe("POST");
			expect(requests[0]?.responseStatus).toBe(201);
			expect(requests[0]?.duration).toBeGreaterThanOrEqual(0);
			expect(requests[0]?.timestamp).toBeGreaterThan(0);
		});
	});

	describe("Header masking", () => {
		it("masks sensitive headers: authorization, cookie, x-api-key", async () => {
			await attachAndCapture(
				{
					headers: {
						authorization: "Bearer secret-token-123",
						cookie: "session=abc123",
						"x-api-key": "my-secret-key",
						"content-type": "application/json",
					},
				},
				{
					headers: {
						"set-cookie": "session=xyz",
						"content-type": "application/json",
					},
				},
			);

			const requests = capture.getRequests();
			expect(requests[0]?.requestHeaders.authorization).toBe("[REDACTED]");
			expect(requests[0]?.requestHeaders.cookie).toBe("[REDACTED]");
			expect(requests[0]?.requestHeaders["x-api-key"]).toBe("[REDACTED]");
			expect(requests[0]?.requestHeaders["content-type"]).toBe("application/json");
			expect(requests[0]?.responseHeaders["set-cookie"]).toBe("[REDACTED]");
			expect(requests[0]?.responseHeaders["content-type"]).toBe("application/json");
		});
	});

	describe("Response body sanitization", () => {
		it("sanitizes JWT tokens in response body", async () => {
			const jwt =
				"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
			// Use a non-sensitive key to avoid the sensitive-key regex overwriting the JWT_REDACTED token
			await attachAndCapture({}, { body: `{"accessCode": "${jwt}"}` });

			const requests = capture.getRequests();
			expect(requests[0]?.responseBody).not.toContain(jwt);
			expect(requests[0]?.responseBody).toContain("[JWT_REDACTED]");
		});

		it("sanitizes email addresses in response body", async () => {
			await attachAndCapture({}, { body: '{"email": "user@example.com", "name": "John"}' });

			const requests = capture.getRequests();
			expect(requests[0]?.responseBody).not.toContain("user@example.com");
			expect(requests[0]?.responseBody).toContain("[EMAIL_REDACTED]");
		});

		it("sanitizes sensitive JSON keys (password, secret, token) in response body", async () => {
			await attachAndCapture(
				{},
				{
					body: JSON.stringify({
						password: "supersecret123",
						secret: "my-api-secret",
						token: "refresh-token-value",
						name: "visible",
					}),
				},
			);

			const requests = capture.getRequests();
			const body = requests[0]?.responseBody ?? "";
			expect(body).toContain("[REDACTED]");
			expect(body).not.toContain("supersecret123");
			expect(body).not.toContain("my-api-secret");
			expect(body).toContain("visible");
		});
	});

	describe("Request limits", () => {
		it("respects MAX_REQUESTS limit (501st request dropped)", async () => {
			await capture.attach(page as never);

			for (let i = 0; i < 505; i++) {
				const request = createMockRequest({
					url: `https://api.example.com/endpoint-${i}`,
					resourceType: "fetch",
				});
				const response = createMockResponse(request, {
					status: 200,
					body: `{"i": ${i}}`,
				});
				await page.triggerEvent("request", request);
				await page.triggerEvent("response", response);
			}

			expect(capture.getRequestCount()).toBe(500);
		});
	});

	describe("Request lifecycle", () => {
		it("cleans up pending on requestfailed", async () => {
			await capture.attach(page as never);

			const request = createMockRequest({ url: "https://api.example.com/failing" });
			await page.triggerEvent("request", request);
			await page.triggerEvent("requestfailed", request);

			// Now if a response arrives for this request, it should not be captured
			const response = createMockResponse(request, { status: 500 });
			await page.triggerEvent("response", response);

			expect(capture.getRequestCount()).toBe(0);
		});

		it("fires onResponse callback", async () => {
			const onResponseCallback = vi.fn();
			capture.setOnResponse(onResponseCallback);

			await attachAndCapture({ url: "https://api.example.com/callback-test" }, { status: 200 });

			expect(onResponseCallback).toHaveBeenCalledTimes(1);
			expect(onResponseCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					url: "https://api.example.com/callback-test",
					responseStatus: 200,
				}),
			);
		});

		it("handles concurrent identical requests without collision", async () => {
			await capture.attach(page as never);

			// Create two separate request objects with the same URL
			const request1 = createMockRequest({ url: "https://api.example.com/same" });
			const request2 = createMockRequest({ url: "https://api.example.com/same" });

			// Both are pending
			await page.triggerEvent("request", request1);
			await page.triggerEvent("request", request2);

			// First response
			const response1 = createMockResponse(request1, { status: 200, body: '{"r":1}' });
			await page.triggerEvent("response", response1);

			// Second response
			const response2 = createMockResponse(request2, { status: 201, body: '{"r":2}' });
			await page.triggerEvent("response", response2);

			const requests = capture.getRequests();
			expect(requests).toHaveLength(2);
			expect(requests[0]?.responseStatus).toBe(200);
			expect(requests[1]?.responseStatus).toBe(201);
		});

		it("tracks pending/completed request counts correctly", async () => {
			expect(capture.getRequestCount()).toBe(0);

			await attachAndCapture({ url: "https://api.example.com/first" }, { status: 200 });
			expect(capture.getRequestCount()).toBe(1);

			// Add another request directly
			const request2 = createMockRequest({ url: "https://api.example.com/second" });
			const response2 = createMockResponse(request2, { status: 200 });
			await page.triggerEvent("request", request2);
			await page.triggerEvent("response", response2);

			expect(capture.getRequestCount()).toBe(2);
			expect(capture.getRequests()).toHaveLength(2);
		});
	});
});
