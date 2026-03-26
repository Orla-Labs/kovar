import type { BrowserContext, ExpectMatcherState } from "@playwright/test";
import { analyzeCookies, mapPlaywrightCookies } from "../checks/cookies.js";
import type { CookieCheckOptions } from "../types/index.js";
import { filterFailures, formatMatcherMessage } from "../utils/matcher-helpers.js";

export async function toHaveSecureCookies(
	this: ExpectMatcherState,
	received: BrowserContext,
	options?: CookieCheckOptions,
) {
	const rawCookies = await received.cookies();
	const cookies = mapPlaywrightCookies(rawCookies);

	const findings = analyzeCookies(cookies, options);
	const failures = filterFailures(findings);
	const pass = failures.length === 0;

	return {
		pass,
		message: () =>
			formatMatcherMessage(
				findings,
				"toHaveSecureCookies",
				"All cookies have proper security flags.",
				this.utils,
				this.isNot,
			),
		name: "toHaveSecureCookies",
		expected: "All cookies have proper security flags",
		actual: received,
	};
}
