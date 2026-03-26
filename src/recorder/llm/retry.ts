const TRANSIENT_HTTP_CODES = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_ERRORS = new Set(["ECONNRESET", "ETIMEDOUT"]);

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const BACKOFF_MULTIPLIER = 2;
const REQUEST_TIMEOUT_MS = 60000;

function sanitizeErrorMessage(msg: string): string {
	return msg.replace(/\b(sk-|pk-|key-|Bearer\s+)[a-zA-Z0-9_-]{10,}\b/g, "[REDACTED]");
}

export class LLMRequestError extends Error {
	constructor(
		message: string,
		public readonly attempts: number,
		public readonly lastStatus?: number,
	) {
		super(sanitizeErrorMessage(message));
		this.name = "LLMRequestError";
	}
}

function isTransientNetworkError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const cause = (error as Error & { cause?: { code?: string } }).cause;
	if (cause?.code && TRANSIENT_NETWORK_ERRORS.has(cause.code)) return true;
	if (error.name === "AbortError") return false;
	return Array.from(TRANSIENT_NETWORK_ERRORS).some((code) => error.message.includes(code));
}

function parseRetryAfterHeader(response: Response): number | null {
	const header = response.headers.get("retry-after");
	if (!header) return null;
	const seconds = Number(header);
	if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
	const date = Date.parse(header);
	if (!Number.isNaN(date)) {
		const delay = date - Date.now();
		return delay > 0 ? delay : null;
	}
	return null;
}

function computeDelay(attempt: number): number {
	return INITIAL_DELAY_MS * BACKOFF_MULTIPLIER ** (attempt - 1);
}

function computeRetryDelay(response: Response, attempt: number): number {
	const baseDelay = computeDelay(attempt);
	if (response.status !== 429) return baseDelay;
	return parseRetryAfterHeader(response) ?? baseDelay;
}

function logRetry(providerName: string, reason: string, attempt: number, delayMs: number): void {
	console.warn(
		`[${providerName}] ${sanitizeErrorMessage(reason)}, retrying (attempt ${attempt}/${MAX_RETRIES + 1}) after ${delayMs}ms`,
	);
}

function buildExhaustedError(
	providerName: string,
	attempts: number,
	message: string,
	lastStatus?: number,
): LLMRequestError {
	return new LLMRequestError(
		`${providerName} API request failed after ${attempts} attempts: ${message}`,
		attempts,
		lastStatus,
	);
}

export async function fetchWithRetry(
	url: string,
	init: RequestInit,
	providerName: string,
): Promise<Response> {
	let lastError: Error | null = null;
	let lastStatus: number | undefined;
	const totalAttempts = MAX_RETRIES + 1;

	for (let attempt = 1; attempt <= totalAttempts; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(url, { ...init, signal: controller.signal });

			if (response.ok) return response;

			lastStatus = response.status;

			if (TRANSIENT_HTTP_CODES.has(response.status) && attempt <= MAX_RETRIES) {
				const delay = computeRetryDelay(response, attempt);
				logRetry(providerName, `Request failed with ${response.status}`, attempt, delay);
				await sleep(delay);
				continue;
			}

			return response;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (isTransientNetworkError(error) && attempt <= MAX_RETRIES) {
				const delay = computeDelay(attempt);
				logRetry(providerName, `Network error (${lastError.message})`, attempt, delay);
				await sleep(delay);
				continue;
			}

			if (attempt > MAX_RETRIES) {
				throw buildExhaustedError(providerName, attempt, lastError.message, lastStatus);
			}

			throw lastError;
		} finally {
			clearTimeout(timeout);
		}
	}

	throw buildExhaustedError(
		providerName,
		totalAttempts,
		lastError?.message ?? "unknown error",
		lastStatus,
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
