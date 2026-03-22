import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSourceLocation } from "../../../src/source/parser.js";

const FIXTURE = path.resolve(__dirname, "fixtures/LoginForm.tsx");

describe("parseSourceLocation", () => {
	it("extracts componentName from function declaration", () => {
		const result = parseSourceLocation(FIXTURE, 11, 2);
		expect(result).not.toBeNull();
		expect(result!.componentName).toBe("LoginForm");
	});

	it("extracts data-testid from button element", () => {
		const result = parseSourceLocation(FIXTURE, 19, 3);
		expect(result).not.toBeNull();
		expect(result!.elementTag).toBe("button");
		expect(result!.testId).toBe("login-submit");
	});

	it("extracts aria-label from input element", () => {
		const result = parseSourceLocation(FIXTURE, 12, 3);
		expect(result).not.toBeNull();
		expect(result!.elementTag).toBe("input");
		expect(result!.ariaLabel).toBe("Email address");
	});

	it("extracts role attribute", () => {
		const result = parseSourceLocation(FIXTURE, 11, 2);
		expect(result).not.toBeNull();
		expect(result!.role).toBe("form");
	});

	it("extracts event handler names (onClick, onChange)", () => {
		const button = parseSourceLocation(FIXTURE, 19, 3);
		expect(button).not.toBeNull();
		expect(button!.eventHandlers).toContain("handleLogin");

		const input = parseSourceLocation(FIXTURE, 12, 3);
		expect(input).not.toBeNull();
		expect(input!.eventHandlers).toContain("handleChange");
	});

	it("extracts className", () => {
		const result = parseSourceLocation(FIXTURE, 11, 2);
		expect(result).not.toBeNull();
		expect(result!.className).toBe("form-container");
	});

	it("returns null for non-existent file", () => {
		const result = parseSourceLocation("/tmp/does-not-exist.tsx", 1, 0);
		expect(result).toBeNull();
	});

	it("returns null for line with no JSX element", () => {
		const result = parseSourceLocation(FIXTURE, 6, 0);
		expect(result).toBeNull();
	});

	it("extracts handler name from inline arrow function onClick={() => submit()}", () => {
		const result = parseSourceLocation(FIXTURE, 22, 3);
		expect(result).not.toBeNull();
		expect(result!.elementTag).toBe("button");
		expect(result!.testId).toBe("inline-arrow");
		expect(result!.eventHandlers).toContain("submit");
	});

	it("extracts handler name from member expression onClick={() => api.post()}", () => {
		const result = parseSourceLocation(FIXTURE, 23, 3);
		expect(result).not.toBeNull();
		expect(result!.elementTag).toBe("button");
		expect(result!.testId).toBe("member-arrow");
		expect(result!.eventHandlers).toContain("post");
	});

	it("matches exact column position (not just line)", () => {
		// Column 3 matches the element; column 0 should not match anything on that line
		const correct = parseSourceLocation(FIXTURE, 19, 3);
		expect(correct).not.toBeNull();
		expect(correct!.elementTag).toBe("button");

		const wrong = parseSourceLocation(FIXTURE, 19, 0);
		expect(wrong).toBeNull();
	});
});
