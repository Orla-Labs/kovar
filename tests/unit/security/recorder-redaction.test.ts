import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * R2 PoC: network data is sent to the LLM vendor by default under regex-only
 * redaction. These secrets currently pass through.
 */
import { describe, expect, it } from "vitest";
import { sanitizeBody } from "../../../src/recorder/network-capture.js";
import { TestGenerator } from "../../../src/recorder/test-generator.js";
import { MockLLMProvider } from "../../helpers/mock-llm-provider.js";

describe("R2 PoC: network body redaction", () => {
	it("redacts camelCase / prefixed token keys", () => {
		const out = sanitizeBody(
			JSON.stringify({
				accessToken: "AT_SECRET",
				idToken: "ID_SECRET",
				refreshToken: "RT_SECRET",
				sessionToken: "ST_SECRET",
				user: { apiSecret: "AS_SECRET" },
				name: "Ana",
			}),
		);
		for (const s of ["AT_SECRET", "ID_SECRET", "RT_SECRET", "ST_SECRET", "AS_SECRET"])
			expect(out).not.toContain(s);
		expect(out).toContain("Ana");
	});

	it("redacts urlencoded form fields beyond password=", () => {
		const out = sanitizeBody(
			"grant_type=refresh_token&refresh_token=RT_SECRET&client_secret=CS_SECRET&otp=123456&user=ana",
		);
		expect(out).not.toContain("RT_SECRET");
		expect(out).not.toContain("CS_SECRET");
		expect(out).not.toContain("123456");
		expect(out).toContain("user=ana");
	});

	it("redacts JSON secrets even when the body exceeds the 10KB capture limit", () => {
		const big = JSON.stringify({ access_token: "OPAQUE_SECRET_123", padding: "x".repeat(20000) });
		const out = sanitizeBody(big);
		expect(out).not.toContain("OPAQUE_SECRET_123");
		expect(out.length).toBeLessThanOrEqual(10240);
	});
});

describe("R2 PoC: fallback .recording file", () => {
	it("does not write query-string tokens to the tests directory", async () => {
		const dir = mkdtempSync(join(tmpdir(), "kovar-rec-"));
		const provider = new MockLLMProvider();
		provider.setFailOnCall?.(0);
		const gen = new TestGenerator(
			{
				name: "x",
				generate: async () => {
					throw new Error("boom");
				},
			},
			dir,
		);
		const res = await gen.generate(
			{
				startUrl: "https://app.example/?magic_link=ML_SECRET",
				finalUrl: "https://app.example/home?token=FINAL_SECRET",
				pageTitle: "",
				actions: [
					{ type: "navigation", timestamp: 0, url: "https://app.example/reset?token=NAV_SECRET" },
				] as never,
				requests: [
					{
						timestamp: 0,
						method: "GET",
						url: "https://api.example/api/me?api_key=REQ_SECRET",
						resourceType: "fetch",
						requestHeaders: {},
						requestPostData: null,
						responseStatus: 200,
						responseHeaders: {},
						responseBody: null,
						duration: 1,
					},
				],
				assertions: [],
				startTime: 0,
				endTime: 1,
			},
			"t",
		);
		const written = readFileSync(res.specPath, "utf-8");
		for (const s of ["ML_SECRET", "FINAL_SECRET", "NAV_SECRET", "REQ_SECRET"])
			expect(written).not.toContain(s);
	});
});
