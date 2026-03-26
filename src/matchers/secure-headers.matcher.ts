import type { APIResponse, ExpectMatcherState, Response } from "@playwright/test";
import { analyzeHeaders } from "../checks/headers.js";
import type { HeaderCheckOptions } from "../types/index.js";
import { filterFailures, formatMatcherMessage } from "../utils/matcher-helpers.js";

type ResponseLike = Response | APIResponse;

function isPageResponse(r: ResponseLike): r is Response {
	return "allHeaders" in r && typeof (r as Response).allHeaders === "function";
}

export async function toHaveSecureHeaders(
	this: ExpectMatcherState,
	received: ResponseLike,
	options?: HeaderCheckOptions,
) {
	const headers = isPageResponse(received) ? await received.allHeaders() : received.headers();

	const findings = analyzeHeaders(headers, options);
	const failures = filterFailures(findings);
	const pass = failures.length === 0;

	return {
		pass,
		message: () =>
			formatMatcherMessage(
				findings,
				"toHaveSecureHeaders",
				"All security headers are properly configured.",
				this.utils,
				this.isNot,
			),
		name: "toHaveSecureHeaders",
		expected: "All security headers properly configured",
		actual: received,
	};
}
