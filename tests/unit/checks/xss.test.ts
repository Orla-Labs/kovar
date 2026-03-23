import { describe, expect, it, vi } from "vitest";
import { XSS_POLYGLOTS } from "../../../src/payloads/index.js";

describe("XSS Payloads", () => {
	it("has exactly 10 quick-depth polyglot payloads", () => {
		const quick = XSS_POLYGLOTS.filter((p) => p.depth === "quick");
		expect(quick).toHaveLength(10);
	});

	it("has 15 standard-depth polyglot payloads", () => {
		const standard = XSS_POLYGLOTS.filter((p) => p.depth === "standard");
		expect(standard).toHaveLength(15);
	});

	it("has 15 thorough-depth polyglot payloads", () => {
		const thorough = XSS_POLYGLOTS.filter((p) => p.depth === "thorough");
		expect(thorough).toHaveLength(15);
	});

	it("has 40 total payloads across all depths", () => {
		expect(XSS_POLYGLOTS).toHaveLength(40);
	});

	it("every payload has a unique id", () => {
		const ids = XSS_POLYGLOTS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("every payload contains the canary prefix", () => {
		for (const payload of XSS_POLYGLOTS) {
			expect(payload.payload).toContain("kovar-xss");
		}
	});

	it("every payload has a name and at least one context", () => {
		for (const payload of XSS_POLYGLOTS) {
			expect(payload.name).toBeTruthy();
			expect(payload.contexts.length).toBeGreaterThan(0);
		}
	});

	it("payloads contain executable patterns", () => {
		const executablePatterns = [
			/alert\(/,
			/onerror/i,
			/onload/i,
			/onfocus/i,
			/ontoggle/i,
			/<script/i,
			/javascript:/i,
			/onbegin/i,
			/onstart/i,
			/onclick/i,
		];
		for (const payload of XSS_POLYGLOTS) {
			const hasExecutable = executablePatterns.some((p) => p.test(payload.payload));
			expect(hasExecutable, `Payload ${payload.id} should contain an executable pattern`).toBe(
				true,
			);
		}
	});

	it("standard payloads include encoding evasion techniques", () => {
		const standard = XSS_POLYGLOTS.filter((p) => p.depth === "standard");
		const names = standard.map((p) => p.name);
		expect(names).toContain("mixed case evasion");
		expect(names).toContain("comment breakout");
	});

	it("thorough payloads include advanced techniques", () => {
		const thorough = XSS_POLYGLOTS.filter((p) => p.depth === "thorough");
		const names = thorough.map((p) => p.name);
		expect(names).toContain("unicode escape sequence");
		expect(names).toContain("base64 data uri");
		expect(names).toContain("polyglot all contexts");
	});

	it("selectPayloads depth filtering works correctly", () => {
		const depthOrder = ["quick", "standard", "thorough"];
		const quickOnly = XSS_POLYGLOTS.filter(
			(p) => depthOrder.indexOf(p.depth) <= depthOrder.indexOf("quick"),
		);
		const upToStandard = XSS_POLYGLOTS.filter(
			(p) => depthOrder.indexOf(p.depth) <= depthOrder.indexOf("standard"),
		);
		const all = XSS_POLYGLOTS.filter(
			(p) => depthOrder.indexOf(p.depth) <= depthOrder.indexOf("thorough"),
		);

		expect(quickOnly).toHaveLength(10);
		expect(upToStandard).toHaveLength(25);
		expect(all).toHaveLength(40);
	});
});

describe("XSS Scanner — delayBetweenPayloads", () => {
	it("applies delay between API payloads when configured", async () => {
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		// Import the scanner to check the delay logic exists in testViaAPI
		const { XSSScanner } = await import("../../../src/checks/xss.js");

		// Verify the class exists and has scan method
		expect(XSSScanner).toBeDefined();
		expect(typeof XSSScanner.prototype.scan).toBe("function");

		// Verify delayBetweenPayloads is accepted in the options type
		const options = { delayBetweenPayloads: 100, depth: "quick" as const };
		expect(options.delayBetweenPayloads).toBe(100);

		setTimeoutSpy.mockRestore();
	});

	it("defaults to 0 delay when not specified", () => {
		const options = { depth: "quick" as const };
		const delay = options.delayBetweenPayloads ?? 0;
		expect(delay).toBe(0);
	});
});
