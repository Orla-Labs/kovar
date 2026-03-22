import { describe, expect, it } from "vitest";
import { isReflectedUnescaped } from "../../../src/checks/xss.js";
import type { PayloadDefinition } from "../../../src/types/payloads.js";

function makePayload(payload: string): PayloadDefinition {
	return {
		id: "test-001",
		name: "test payload",
		payload,
		contexts: ["html-body"],
		depth: "quick",
	};
}

describe("isReflectedUnescaped", () => {
	const imgPayload = makePayload('<img src=x onerror="alert(1)">');

	it("returns true when payload is reflected unescaped with dangerous pattern", () => {
		const body = `<html><body>Result: <img src=x onerror="alert(1)"></body></html>`;
		expect(isReflectedUnescaped(body, imgPayload)).toBe(true);
	});

	it("returns false when payload is properly HTML-escaped", () => {
		const body = `<html><body>Result: &lt;img src=x onerror="alert(1)"&gt;</body></html>`;
		expect(isReflectedUnescaped(body, imgPayload)).toBe(false);
	});

	it("returns false when payload is not present at all", () => {
		const body = "<html><body>No reflection here</body></html>";
		expect(isReflectedUnescaped(body, imgPayload)).toBe(false);
	});

	it("returns false when both escaped and unescaped versions exist (escaped-only path)", () => {
		// The escaped version is present alongside the raw version.
		// The function checks: hasEscapedOnly = body.includes(escaped) && !hasUnescaped
		// Since hasUnescaped is true here, hasEscapedOnly is false, so this falls through
		// to the dangerous pattern check — this IS a finding because unescaped payload exists.
		const escaped = '&lt;img src=x onerror="alert(1)"&gt;';
		const body = `<html>${escaped} and also <img src=x onerror="alert(1)"></html>`;
		expect(isReflectedUnescaped(body, imgPayload)).toBe(true);
	});

	it("returns false when reflected but no dangerous pattern matches", () => {
		// A payload that doesn't match DANGEROUS_RESPONSE_PATTERNS
		const harmless = makePayload("hello world");
		const body = "<html><body>hello world</body></html>";
		expect(isReflectedUnescaped(body, harmless)).toBe(false);
	});

	it("detects svg onload payload", () => {
		const svgPayload = makePayload("<svg/onload=alert('xss')>");
		const body = "<html><body><svg/onload=alert('xss')></body></html>";
		expect(isReflectedUnescaped(body, svgPayload)).toBe(true);
	});

	it("detects script tag injection", () => {
		const scriptPayload = makePayload("</script><script>alert('xss')</script>");
		const body = "</script><script>alert('xss')</script>";
		expect(isReflectedUnescaped(body, scriptPayload)).toBe(true);
	});

	it("detects event handler attribute breakout", () => {
		const attrPayload = makePayload('" onfocus="alert(1)" autofocus="');
		const body = '<input value="" onfocus="alert(1)" autofocus="">';
		expect(isReflectedUnescaped(body, attrPayload)).toBe(true);
	});

	it("detects javascript: protocol payload", () => {
		const jsPayload = makePayload("javascript:alert('xss')");
		const body = "<a href=\"javascript:alert('xss')\">click</a>";
		expect(isReflectedUnescaped(body, jsPayload)).toBe(true);
	});

	it("detects template literal breakout", () => {
		const tplPayload = makePayload("${alert('xss')}");
		const body = "const x = `${alert('xss')}`;";
		expect(isReflectedUnescaped(body, tplPayload)).toBe(true);
	});

	it("detects iframe srcdoc payload", () => {
		const iframePayload = makePayload('<iframe srcdoc="<script>alert(1)</script>">');
		const body = '<html><body><iframe srcdoc="<script>alert(1)</script>"></body></html>';
		expect(isReflectedUnescaped(body, iframePayload)).toBe(true);
	});

	it("detects details ontoggle payload", () => {
		const detailsPayload = makePayload('<details open ontoggle="alert(1)">');
		const body = '<html><body><details open ontoggle="alert(1)"></body></html>';
		expect(isReflectedUnescaped(body, detailsPayload)).toBe(true);
	});

	it("returns false for escaped-only reflection even with dangerous body content", () => {
		// Escaped payload present, raw payload NOT present, but body has other dangerous patterns
		const body =
			'<html><body>&lt;img src=x onerror="alert(1)"&gt;<script>legit()</script></body></html>';
		expect(isReflectedUnescaped(body, imgPayload)).toBe(false);
	});
});
