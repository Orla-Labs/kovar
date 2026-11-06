/**
 * Strict grammar for assertion code produced by the recorder's own browser-side
 * detector (see browser/assertion-detection.ts) and by AssertionDetector.suggestFromNetwork.
 *
 * Suggestions arrive over page-exposed bindings (`window.__kovar_suggestAssertion`),
 * which any script on the recorded page — including cross-origin iframes — can
 * call. Their `playwrightCode` is therefore attacker-controlled and must never be
 * forwarded to the LLM ("MUST include in spec") unless it is exactly one of the
 * shapes the recorder itself emits.
 */

// Body of a JS regex literal: escaped pairs, or any char except `/`, `\`, `[`, `]`
// and line terminators. Excluding unescaped `[`/`]` prevents a character class from
// hiding the closing `/`; the recorder escapes these via escapeRegex().
const REGEX_BODY = String.raw`(?:\\[^\r\n\u2028\u2029]|[^/\\\[\]\r\n\u2028\u2029])+`;

const ALLOWED_ASSERTION_SHAPES: RegExp[] = [
	new RegExp(String.raw`^await expect\(page\)\.toHaveURL\(/${REGEX_BODY}/\)$`),
	new RegExp(String.raw`^await expect\(page\)\.toHaveTitle\(/${REGEX_BODY}/\)$`),
	new RegExp(String.raw`^await expect\(page\.getByText\(/${REGEX_BODY}/\)\)\.toBeVisible\(\)$`),
	/^await expect\(page\.getByRole\('dialog'\)\)\.toBeVisible\(\)$/,
	/^await expect\(page\.locator\('\[role="progressbar"\]'\)\)\.toBeHidden\(\)$/,
	/^\/\/ Verify API: [^\r\n\u2028\u2029]{0,300}$/,
];

export function isRecorderAssertionCode(code: unknown): code is string {
	if (typeof code !== "string" || code.length > 400) return false;
	return ALLOWED_ASSERTION_SHAPES.some((re) => re.test(code));
}
