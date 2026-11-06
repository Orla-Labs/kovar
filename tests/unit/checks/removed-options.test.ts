import type { APIRequestContext } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { checkAuth } from "../../../src/checks/auth.js";
import { checkCSRF } from "../../../src/checks/csrf.js";
import { analyzeHeaders } from "../../../src/checks/headers.js";

// These options were documented but never read. 0.7.0 removes them and throws when they
// are passed, so JS callers (no type checking) learn the option did nothing.
const request = { fetch: vi.fn() } as unknown as APIRequestContext;

describe("options removed in 0.7.0 throw instead of being ignored", () => {
	it("headers: allowXFrameOptionsSameOrigin", () => {
		expect(() => analyzeHeaders({}, { allowXFrameOptionsSameOrigin: true } as never)).toThrow(
			/allowXFrameOptionsSameOrigin.*removed in 0\.7\.0/,
		);
	});

	it("auth: expectedStatus", async () => {
		await expect(
			checkAuth(request, "https://example.com", { expectedStatus: 401 } as never),
		).rejects.toThrow(/expectedStatus.*removed in 0\.7\.0/);
		expect(request.fetch).not.toHaveBeenCalled();
	});

	it("csrf: tokenCookies", async () => {
		await expect(
			checkCSRF(request, "https://example.com", { tokenCookies: ["XSRF-TOKEN"] } as never),
		).rejects.toThrow(/tokenCookies.*removed in 0\.7\.0/);
		expect(request.fetch).not.toHaveBeenCalled();
	});

	it("an explicitly undefined removed option still throws (key present)", () => {
		expect(() => analyzeHeaders({}, { allowXFrameOptionsSameOrigin: undefined } as never)).toThrow(
			/removed in 0\.7\.0/,
		);
	});

	it("valid options are unaffected", () => {
		expect(() => analyzeHeaders({}, { minHSTSMaxAge: 1 })).not.toThrow();
	});
});
