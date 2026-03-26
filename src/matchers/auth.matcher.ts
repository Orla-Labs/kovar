import type { APIRequestContext, ExpectMatcherState } from "@playwright/test";
import { type AuthCheckOptions, checkAuth } from "../checks/auth.js";
import { filterFailures, formatMatcherMessage } from "../utils/matcher-helpers.js";

export async function toRequireAuthentication(
	this: ExpectMatcherState,
	received: APIRequestContext,
	url: string,
	options?: AuthCheckOptions,
) {
	const findings = await checkAuth(received, url, options);
	const failures = filterFailures(findings);
	const pass = failures.length === 0;

	return {
		pass,
		message: () =>
			formatMatcherMessage(
				findings,
				"toRequireAuthentication",
				"Authentication is properly enforced.",
				this.utils,
				this.isNot,
			),
		name: "toRequireAuthentication",
		expected: "Endpoint requires authentication",
		actual: received,
	};
}
