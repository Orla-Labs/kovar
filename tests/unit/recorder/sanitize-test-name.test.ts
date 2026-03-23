import { describe, expect, it } from "vitest";
import { sanitizeTestName } from "../../../src/recorder/codegen.js";

describe("sanitizeTestName", () => {
	it("strips special characters and collapses dashes", () => {
		expect(sanitizeTestName("my test!@#$%name")).toBe("my-test-name");
	});

	it("collapses multiple consecutive dashes", () => {
		expect(sanitizeTestName("my---test---name")).toBe("my-test-name");
	});

	it("handles empty input — returns 'recorded-test'", () => {
		expect(sanitizeTestName("")).toBe("recorded-test");
	});

	it("handles input that becomes empty after stripping — returns 'recorded-test'", () => {
		expect(sanitizeTestName("!@#$%^&*()")).toBe("recorded-test");
	});

	it("handles leading dashes (strips them)", () => {
		expect(sanitizeTestName("---my-test")).toBe("my-test");
	});

	it("handles trailing dashes (strips them)", () => {
		expect(sanitizeTestName("my-test---")).toBe("my-test");
	});

	it("handles leading and trailing dashes", () => {
		expect(sanitizeTestName("---my-test---")).toBe("my-test");
	});

	it("converts to lowercase", () => {
		expect(sanitizeTestName("My-Test-NAME")).toBe("my-test-name");
	});

	it("handles dots (path traversal prevention) — dots become dashes", () => {
		expect(sanitizeTestName("../../../etc/passwd")).toBe("etc-passwd");
	});

	it("handles dots in filenames", () => {
		expect(sanitizeTestName("my.test.name")).toBe("my-test-name");
	});

	it("preserves underscores and dashes", () => {
		expect(sanitizeTestName("my_test-name")).toBe("my_test-name");
	});

	it("handles alphanumeric input unchanged (except case)", () => {
		expect(sanitizeTestName("checkout")).toBe("checkout");
		expect(sanitizeTestName("test123")).toBe("test123");
	});

	it("handles spaces — converts to dashes", () => {
		expect(sanitizeTestName("my test name")).toBe("my-test-name");
	});
});
