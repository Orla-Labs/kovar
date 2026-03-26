import type { APIRequestContext, ExpectMatcherState } from "@playwright/test";
import { type CSRFCheckOptions, checkCSRF } from "../checks/csrf.js";
import { filterFailures, formatMatcherMessage } from "../utils/matcher-helpers.js";

export async function toBeCSRFProtected(
	this: ExpectMatcherState,
	received: APIRequestContext,
	url: string,
	options?: CSRFCheckOptions,
) {
	const findings = await checkCSRF(received, url, options);
	const failures = filterFailures(findings);
	const pass = failures.length === 0;

	return {
		pass,
		message: () =>
			formatMatcherMessage(
				findings,
				"toBeCSRFProtected",
				"CSRF protection is properly configured.",
				this.utils,
				this.isNot,
			),
		name: "toBeCSRFProtected",
		expected: "Endpoint is protected against CSRF attacks",
		actual: received,
	};
}
