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

function sanitizeResponseBody(body: string): string {
	// Redact JWT tokens
	let sanitized = body.replace(
		/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
		"[JWT_REDACTED]",
	);
	// Redact email addresses
	sanitized = sanitized.replace(
		/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
		"[EMAIL_REDACTED]",
	);
	// Redact string values for sensitive JSON keys
	sanitized = sanitized.replace(
		/("(?:token|secret|password|apiKey|api_key|access_token|refresh_token|private_key|client_secret|session_id|credential)")\s*:\s*"[^"]*"/gi,
		'$1: "[REDACTED]"',
	);
	// Redact non-string values (numbers, booleans, null) for sensitive JSON keys
	sanitized = sanitized.replace(
		/("(?:token|secret|password|apiKey|api_key|access_token|refresh_token|private_key|client_secret|session_id|credential)")\s*:\s*(?:true|false|null|\d[\d.eE+-]*)\b/gi,
		'$1: "[REDACTED]"',
	);
	return sanitized;
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

			if (this.completed.length >= MAX_REQUESTS) return;

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
