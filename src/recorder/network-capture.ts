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

const SENSITIVE_KEY_PATTERN =
	/^(token|secret|password|passwd|apiKey|api_key|access_token|refresh_token|private_key|client_secret|session_id|credential|authorization|auth_token|ssn|credit_card|card_number|cvv|private|signing_key)$/i;

const INLINE_SECRET_PATTERNS = [
	/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
	/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
	/Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g,
	/Basic\s+[A-Za-z0-9+/]+=*/g,
	/password=[^&\s]+/gi,
	/\b(sk-|pk-|key-|ak_|sk_)[A-Za-z0-9_-]+/g,
];

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
		if (SENSITIVE_KEY_PATTERN.test(key)) {
			result[key] = "[REDACTED]";
		} else {
			result[key] = sanitizeJsonValue(value);
		}
	}
	return result;
}

function applyInlineRedactions(text: string): string {
	let result = text;
	for (const pattern of INLINE_SECRET_PATTERNS) {
		const fresh = new RegExp(pattern.source, pattern.flags);
		result = result.replace(fresh, "[REDACTED]");
	}
	return result;
}

function sanitizeResponseBody(body: string): string {
	try {
		const parsed: unknown = JSON.parse(body);
		const sanitized = sanitizeJsonValue(parsed);
		return JSON.stringify(sanitized);
	} catch {
		return applyInlineRedactions(body);
	}
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
					const body = await response.text();
					const truncated = body.length > MAX_BODY_SIZE ? body.substring(0, MAX_BODY_SIZE) : body;
					responseBody = sanitizeResponseBody(truncated);
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
					return postData ? sanitizeResponseBody(postData) : null;
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
