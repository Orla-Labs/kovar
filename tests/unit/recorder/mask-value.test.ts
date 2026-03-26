import { describe, expect, it } from "vitest";
import { maskValue } from "../../../src/recorder/browser/mask-value.js";

function createMockElement(overrides: { type?: string; name?: string; placeholder?: string } = {}) {
	return {
		type: overrides.type ?? "",
		name: overrides.name ?? "",
		placeholder: overrides.placeholder ?? "",
	};
}

describe("maskValue (browser-side)", () => {
	it("masks password fields as [PASSWORD]", () => {
		const el = createMockElement({ type: "password" });
		expect(maskValue(el.type, el.name, el.placeholder, "supersecret123")).toBe("[PASSWORD]");
	});

	it("masks credit card numbers (16-digit patterns) as [CARD]", () => {
		const el = createMockElement({ type: "text" });
		expect(maskValue(el.type, el.name, el.placeholder, "4111 1111 1111 1111")).toBe("[CARD]");
		expect(maskValue(el.type, el.name, el.placeholder, "4111-1111-1111-1111")).toBe("[CARD]");
		expect(maskValue(el.type, el.name, el.placeholder, "4111111111111111")).toBe("[CARD]");
	});

	it("masks JWT tokens (eyJ...) as [TOKEN]", () => {
		const el = createMockElement({ type: "text" });
		const jwt =
			"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0";
		expect(maskValue(el.type, el.name, el.placeholder, jwt)).toBe("[TOKEN]");
	});

	it("masks email addresses as [EMAIL]", () => {
		const el = createMockElement({ type: "text" });
		expect(maskValue(el.type, el.name, el.placeholder, "user@example.com")).toBe("[EMAIL]");
		expect(maskValue(el.type, el.name, el.placeholder, "test.user+tag@company.org")).toBe(
			"[EMAIL]",
		);
	});

	it("masks phone numbers on type=tel inputs as [PHONE]", () => {
		const el = createMockElement({ type: "tel" });
		expect(maskValue(el.type, el.name, el.placeholder, "+1 (555) 123-4567")).toBe("[PHONE]");
		expect(maskValue(el.type, el.name, el.placeholder, "555-123-4567")).toBe("[PHONE]");
	});

	it("does not mask phone-like values on non-tel inputs", () => {
		const el = createMockElement({ type: "text" });
		expect(maskValue(el.type, el.name, el.placeholder, "555-123-4567")).toBe("555-123-4567");
	});

	it("masks fields with sensitive names (ssn, cpf, cvv) as [REDACTED] or [SSN]", () => {
		const elSsn = createMockElement({ type: "text", name: "ssn" });
		expect(maskValue(elSsn.type, elSsn.name, elSsn.placeholder, "123-45-6789")).toBe("[SSN]");

		const elCpf = createMockElement({ type: "text", name: "cpf" });
		expect(maskValue(elCpf.type, elCpf.name, elCpf.placeholder, "123.456.789-00")).toBe(
			"[REDACTED]",
		);

		const elCvv = createMockElement({ type: "text", name: "cvv" });
		expect(maskValue(elCvv.type, elCvv.name, elCvv.placeholder, "123")).toBe("[REDACTED]");

		const elSocial = createMockElement({ type: "text", name: "social-security" });
		expect(maskValue(elSocial.type, elSocial.name, elSocial.placeholder, "123-45-6789")).toBe(
			"[SSN]",
		);
	});

	it("masks fields with sensitive placeholder as [REDACTED]", () => {
		const el = createMockElement({
			type: "text",
			placeholder: "Enter your credit card number",
		});
		expect(maskValue(el.type, el.name, el.placeholder, "4111111111111111")).toBe("[CARD]");

		const elExpiry = createMockElement({ type: "text", placeholder: "Expiration date" });
		expect(maskValue(elExpiry.type, elExpiry.name, elExpiry.placeholder, "12/25")).toBe(
			"[REDACTED]",
		);
	});

	it("passes through normal text values unchanged", () => {
		const el = createMockElement({ type: "text" });
		expect(maskValue(el.type, el.name, el.placeholder, "Hello, World!")).toBe("Hello, World!");
		expect(maskValue(el.type, el.name, el.placeholder, "John Doe")).toBe("John Doe");
		expect(maskValue(el.type, el.name, el.placeholder, "some search query")).toBe(
			"some search query",
		);
	});

	it("handles empty string gracefully", () => {
		const el = createMockElement({ type: "text" });
		expect(maskValue(el.type, el.name, el.placeholder, "")).toBe("");
	});

	it("handles null value gracefully", () => {
		const el = createMockElement({ type: "text" });
		// maskValue returns the value unchanged when falsy
		expect(maskValue(el.type, el.name, el.placeholder, null as unknown as string)).toBeNull();
	});

	it("handles undefined value gracefully", () => {
		const el = createMockElement({ type: "text" });
		expect(
			maskValue(el.type, el.name, el.placeholder, undefined as unknown as string),
		).toBeUndefined();
	});
});
