/**
 * Evaluates browser-side template literal scripts (like ACTION_CAPTURE_SCRIPT)
 * in a test environment and provides access to their internal functions.
 *
 * Because these scripts are designed to run in a browser IIFE, we extract
 * individual functions using regex and wrap them so they can be called directly.
 */

/**
 * Extracts a named function from a browser-side IIFE script string.
 * Returns the function body as a string suitable for `new Function()`.
 */
export function extractFunctionSource(script: string, functionName: string): string | null {
	// Match: function name(params) { ... } accounting for nested braces
	const startPattern = new RegExp(`function\\s+${functionName}\\s*\\(`);
	const match = startPattern.exec(script);
	if (!match) return null;

	const startIndex = match.index;
	// Find the opening brace of the function body
	const bodyStart = script.indexOf("{", startIndex + match[0].length);
	if (bodyStart === -1) return null;

	// Count braces to find matching close
	let depth = 0;
	let i = bodyStart;
	while (i < script.length) {
		if (script[i] === "{") depth++;
		else if (script[i] === "}") {
			depth--;
			if (depth === 0) break;
		}
		i++;
	}

	return script.slice(startIndex, i + 1);
}

/**
 * Unescapes a template literal string extracted from raw TypeScript source.
 * In the source file, `\\b` (two chars in source) becomes `\b` (backslash + b)
 * when JS evaluates the template literal at runtime.
 * When we read the file as raw text, every `\\` pair should become a single `\`.
 */
export function unescapeTemplateLiteral(raw: string): string {
	// Replace every `\\` (escaped backslash in source) with a single `\`
	// This handles \\b -> \b, \\d -> \d, \\s -> \s, \\S -> \S, \\\\ -> \\, etc.
	return raw.replace(/\\\\/g, "\\");
}

/**
 * Creates a callable maskValue function from the ACTION_CAPTURE_SCRIPT.
 * Returns a function with signature: (mockEl, value) => maskedValue
 */
export function createMaskValueFn(
	actionCaptureScript: string,
): (el: MockElement, value: string | null | undefined) => string | null | undefined {
	const fnSource = extractFunctionSource(actionCaptureScript, "maskValue");
	if (!fnSource) {
		throw new Error("Could not extract maskValue function from script");
	}

	// Unescape template literal escapes so regex patterns work correctly
	const unescaped = unescapeTemplateLiteral(fnSource);

	// The maskValue function uses `el` parameter which has `.type` and `.getAttribute`
	// We wrap it so it can be called directly
	const wrappedCode = `
		${unescaped}
		return maskValue;
	`;

	const factory = new Function(wrappedCode);
	return factory();
}

export interface MockElement {
	type?: string;
	getAttribute: (name: string) => string | null;
}

/**
 * Creates a mock DOM element for testing browser-side functions.
 */
export function createMockElement(
	overrides: {
		type?: string;
		name?: string;
		placeholder?: string;
	} = {},
): MockElement {
	const attributes: Record<string, string> = {};
	if (overrides.name !== undefined) attributes.name = overrides.name;
	if (overrides.placeholder !== undefined) attributes.placeholder = overrides.placeholder;

	return {
		type: overrides.type ?? "",
		getAttribute(attr: string): string | null {
			return attributes[attr] ?? null;
		},
	};
}

/**
 * Creates a callable getRole function from the ACTION_CAPTURE_SCRIPT.
 */
export function createGetRoleFn(
	actionCaptureScript: string,
): (el: MockElement & { tagName: string; href?: string }) => string | null {
	const fnSource = extractFunctionSource(actionCaptureScript, "getRole");
	if (!fnSource) {
		throw new Error("Could not extract getRole function from script");
	}

	const wrappedCode = `
		${fnSource}
		return getRole;
	`;

	const factory = new Function(wrappedCode);
	return factory();
}
