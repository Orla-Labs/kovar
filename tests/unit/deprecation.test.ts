import { afterEach, describe, expect, it, vi } from "vitest";
import { DEPRECATIONS, warnDeprecated } from "../../src/utils/deprecation.js";

afterEach(() => {
	vi.restoreAllMocks();
	(globalThis as unknown as Record<symbol, unknown>)[Symbol.for("@orlalabs/kovar.deprecations")] =
		undefined;
});

describe("deprecation warnings (0.7.0)", () => {
	it("emits a DeprecationWarning once per code (stderr via process.emitWarning, never stdout)", () => {
		const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
		const log = vi.spyOn(console, "log");
		warnDeprecated("KOVAR_DEP_MCP");
		warnDeprecated("KOVAR_DEP_MCP");
		expect(emit).toHaveBeenCalledTimes(1);
		expect(emit).toHaveBeenCalledWith(DEPRECATIONS.KOVAR_DEP_MCP, {
			type: "DeprecationWarning",
			code: "KOVAR_DEP_MCP",
		});
		expect(log).not.toHaveBeenCalled();
	});

	it("each surface names 0.8 removal and the replacement", () => {
		expect(DEPRECATIONS.KOVAR_DEP_MCP).toMatch(/removed in Kovar 0\.8.*Caliper/);
		expect(DEPRECATIONS.KOVAR_DEP_RECORDER).toMatch(/removed in Kovar 0\.8/);
		expect(DEPRECATIONS.KOVAR_DEP_A11Y).toMatch(/removed in Kovar 0\.8.*@axe-core\/playwright/);
	});

	it("toBeAccessible warns", async () => {
		const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
		const { toBeAccessible } = await import("../../src/matchers/accessibility.matcher.js");
		const page = { evaluate: vi.fn().mockRejectedValue(new Error("stop")) };
		await toBeAccessible.call({ utils: {}, isNot: false } as never, page as never).catch(() => {});
		expect(emit).toHaveBeenCalledWith(DEPRECATIONS.KOVAR_DEP_A11Y, expect.anything());
	});
});
