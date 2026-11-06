import type { Page, Request } from "@playwright/test";
import type { RecordedRequest } from "./types.js";

const MAX_BODY_SIZE = 10240;
const MAX_REQUESTS = 500;
const CAPTURED_RESOURCE_TYPES = new Set(["fetch", "xhr"]);
const LOGGED_RESOURCE_TYPES = new Set(["fetch", "xhr", "document"]);
const SENSITIVE_HEADERS = new Set([
	"authorization",
	"cookie",
	"set-cookie",
	"x-api-key",
	"x-auth-token",
	"x-csrf-token",
	"x-session-id",
	"x-access-token",
	"x-refresh-token",
	"x-forwarded-for",
	"cf-connecting-ip",
	"proxy-authorization",
]);

const SENSITIVE_HEADER_PATTERN = /token|secret|key|auth|session/i;

function maskHeaders(headers: Record<string, string>): Record<string, string> {
	const masked: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		const lower = key.toLowerCase();
		masked[key] =
			SENSITIVE_HEADERS.has(lower) || SENSITIVE_HEADER_PATTERN.test(lower) ? "[REDACTED]" : value;
	}
	return masked;
}

/**
 * Sensitive key detection. Keys are normalised (lower-cased, `_`/`-`/`.` removed)
 * and matched on suffix so camelCase / prefixed variants (`accessToken`,
 * `id_token`, `user.apiSecret`, `x-session-token`) are caught. Over-redaction is
 * the safe failure mode: this data is sent to a third-party LLM vendor.
 */
const SENSITIVE_KEY_SUFFIX =
	/(token|secret|passw(or)?d|passwd|pwd|passphrase|apikey|privatekey|signingkey|clientsecret|credential|credentials|authorization|auth|sessionid|sid|ssn|creditcard|cardnumber|cvv|cvc|otp|totp|mfacode|pin|jwt|cookie)$/;
const SENSITIVE_KEY_EXACT = new Set(["code", "authcode", "authorizationcode", "verificationcode"]);

function isSensitiveKey(key: string): boolean {
	const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "");
	return SENSITIVE_KEY_EXACT.has(normalised) || SENSITIVE_KEY_SUFFIX.test(normalised);
}

const INLINE_SECRET_PATTERNS = [
	/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
	/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
	/Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g,
	/Basic\s+[A-Za-z0-9+/]+=*/g,
	/\b(sk-|pk-|key-|ak_|sk_)[A-Za-z0-9_-]+/g,
];

/**
 * Key/value pairs in non-JSON (or truncated JSON) text: `"key": "value"`,
 * `key=value` (urlencoded), `key: value`.
 */
const KEY_VALUE_PATTERN =
	/("?)([A-Za-z0-9_.-]{1,64})\1(\s*[:=]\s*)("(?:[^"\\]|\\.)*"?|[^&\s,;}"]+)/g;

function sanitizeJsonValue(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return applyInlineRedactions(value);
	if (Array.isArray(value)) return value.map(sanitizeJsonValue);
	if (typeof value === "object") return sanitizeJsonObject(value as Record<string, unknown>);
	return value;
}

function sanitizeJsonObject(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (isSensitiveKey(key)) {
			result[key] = "[REDACTED]";
		} else {
			result[key] = sanitizeJsonValue(value);
		}
	}
	return result;
}

function redactKeyValuePairs(text: string): string {
	return text.replace(
		KEY_VALUE_PATTERN,
		(match, quote: string, key: string, sep: string, value: string) => {
			if (!isSensitiveKey(key)) return match;
			const redacted = value.startsWith('"') ? '"[REDACTED]"' : "[REDACTED]";
			return `${quote}${key}${quote}${sep}${redacted}`;
		},
	);
}

function applyInlineRedactions(text: string): string {
	let result = redactKeyValuePairs(text);
	for (const pattern of INLINE_SECRET_PATTERNS) {
		const fresh = new RegExp(pattern.source, pattern.flags);
		result = result.replace(fresh, "[REDACTED]");
	}
	return result;
}

/** Bodies larger than this are not JSON-parsed (only regex-redacted). */
const MAX_PARSE_SIZE = 1024 * 1024;

/**
 * Redact then truncate. Redaction runs on the full body (parsed as JSON when
 * possible) *before* truncation, because truncating first produces invalid JSON
 * and silently skipped key-based redaction.
 */
export function sanitizeBody(body: string, maxSize = MAX_BODY_SIZE): string {
	let sanitized: string;
	if (body.length <= MAX_PARSE_SIZE) {
		try {
			sanitized = JSON.stringify(sanitizeJsonValue(JSON.parse(body)));
		} catch {
			sanitized = applyInlineRedactions(body);
		}
	} else {
		sanitized = applyInlineRedactions(body.substring(0, maxSize * 2));
	}
	return sanitized.length > maxSize ? sanitized.substring(0, maxSize) : sanitized;
}

export class NetworkCapture {
	private pending = new Map<Request, { timestamp: number }>();
	private completed: RecordedRequest[] = [];
	private onResponse: ((request: RecordedRequest) => void) | null = null;

	setOnResponse(callback: (request: RecordedRequest) => void): void {
		this.onResponse = callback;
	}

	async attach(page: Page): Promise<void> {
		page.on("request", (request) => {
			const resourceType = request.resourceType();
			if (!LOGGED_RESOURCE_TYPES.has(resourceType)) return;
			this.pending.set(request, {
				timestamp: Date.now(),
			});
		});

		page.on("response", async (response) => {
			const request = response.request();
			const resourceType = request.resourceType();
			if (!LOGGED_RESOURCE_TYPES.has(resourceType)) return;

			const pendingEntry = this.pending.get(request);
			if (!pendingEntry) return;
			this.pending.delete(request);

			if (this.completed.length >= MAX_REQUESTS) {
				if (this.completed.length === MAX_REQUESTS) {
					console.warn(
						`[kovar] Network capture limit reached (${MAX_REQUESTS} requests). Some requests may not be recorded.`,
					);
				}
				return;
			}

			let responseBody: string | null = null;
			if (CAPTURED_RESOURCE_TYPES.has(resourceType)) {
				try {
					responseBody = sanitizeBody(await response.text());
				} catch {
					responseBody = null;
				}
			}

			const recorded: RecordedRequest = {
				timestamp: pendingEntry.timestamp,
				method: request.method(),
				url: request.url(),
				resourceType,
				requestHeaders: maskHeaders(request.headers()),
				requestPostData: (() => {
					const postData = request.postData();
					return postData ? sanitizeBody(postData) : null;
				})(),
				responseStatus: response.status(),
				responseHeaders: maskHeaders(response.headers()),
				responseBody,
				duration: Date.now() - pendingEntry.timestamp,
			};
			this.completed.push(recorded);
			this.onResponse?.(recorded);
		});

		page.on("requestfailed", (request) => {
			this.pending.delete(request);
		});
	}

	getRequests(): RecordedRequest[] {
		return this.completed;
	}

	getRequestCount(): number {
		return this.completed.length;
	}
}
