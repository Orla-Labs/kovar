export interface HeaderCheckOptions {
	skip?: string[];
	only?: string[];
	requiredCSPDirectives?: string[];
	minHSTSMaxAge?: number;
	allowXFrameOptionsSameOrigin?: boolean;
}

export interface CookieCheckOptions {
	skip?: string[];
	sessionCookiePatterns?: RegExp[];
	maxExpiryDays?: number;
	allowSameSiteNone?: string[];
}

export type XSSDepth = "quick" | "standard" | "thorough";

export interface XSSCheckOptions {
	selector?: string;
	depth?: XSSDepth;
	timeout?: number;
	skipPayloads?: string[];
	apiFirst?: boolean;
	/** Delay in milliseconds between payload submissions. Useful for WAF-protected targets. Defaults to 0. */
	delayBetweenPayloads?: number;
	/** Max parallel payload tests. Defaults to 1 (serial execution). */
	concurrency?: number;
}
