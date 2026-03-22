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
}
