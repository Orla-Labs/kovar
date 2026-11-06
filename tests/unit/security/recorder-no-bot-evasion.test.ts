import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// R2-15: a security-testing tool must not ship bot-detection evasion. Guard against
// it coming back in the recorder's browser setup.
const source = readFileSync(join(__dirname, "../../../src/recorder/index.ts"), "utf-8");

describe("recorder does not evade bot detection (R2-15)", () => {
	it.each([
		["AutomationControlled launch flag", /AutomationControlled/],
		["navigator.webdriver override", /navigator\s*,\s*["']webdriver["']/],
		["HeadlessChrome user-agent rewrite", /HeadlessChrome/],
		["user agent override", /userAgent\s*:/],
	])("has no %s", (_name, pattern) => {
		expect(source).not.toMatch(pattern);
	});
});
