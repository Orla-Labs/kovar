import type { BrowserContext, ExpectMatcherState } from "@playwright/test";
import { analyzeCookies, mapPlaywrightCookies } from "../checks/cookies.js";
import type { CookieCheckOptions } from "../types/index.js";

export async function toHaveSecureCookies(
	this: ExpectMatcherState,
	received: BrowserContext,
	options?: CookieCheckOptions,
) {
	const rawCookies = await received.cookies();
	const cookies = mapPlaywrightCookies(rawCookies);

	const findings = analyzeCookies(cookies, options);
	const failures = findings.filter((f) => f.severity === "critical" || f.severity === "high");

	const pass = failures.length === 0;

	return {
		pass,
		message: () => {
			const hint = this.utils.matcherHint("toHaveSecureCookies", undefined, undefined, {
				isNot: this.isNot,
			});
			if (findings.length === 0) {
				return `${hint}\n\nAll cookies have proper security flags.`;
			}
			const lines = findings.map(
				(f) =>
					`  [${f.severity.toUpperCase()}] ${f.cookie}: ${f.message}\n           Fix: ${f.remediation}`,
			);
			return `${hint}\n\n${lines.join("\n\n")}`;
		},
		name: "toHaveSecureCookies",
		expected: "All cookies have proper security flags",
		actual: findings,
	};
}
