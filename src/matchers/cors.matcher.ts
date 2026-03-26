import type { APIRequestContext, ExpectMatcherState } from "@playwright/test";
import { type CORSCheckOptions, checkCORS } from "../checks/cors.js";
import { filterFailures, formatMatcherMessage } from "../utils/matcher-helpers.js";

export async function toHaveSecureCORS(
	this: ExpectMatcherState,
	received: APIRequestContext,
	url: string,
	options?: CORSCheckOptions,
) {
	const findings = await checkCORS(received, url, options);
	const failures = filterFailures(findings);
	const pass = failures.length === 0;

	return {
		pass,
		message: () =>
			formatMatcherMessage(
				findings,
				"toHaveSecureCORS",
				"CORS is properly configured.",
				this.utils,
				this.isNot,
			),
		name: "toHaveSecureCORS",
		expected: "CORS is securely configured",
		actual: received,
	};
}
