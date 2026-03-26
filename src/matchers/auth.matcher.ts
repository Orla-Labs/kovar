import type { APIRequestContext, ExpectMatcherState } from "@playwright/test";
import { type AuthCheckOptions, checkAuth } from "../checks/auth.js";

export async function toRequireAuthentication(
	this: ExpectMatcherState,
	received: APIRequestContext,
	url: string,
	options?: AuthCheckOptions,
) {
	const findings = await checkAuth(received, url, options);
	const failures = findings.filter((f) => f.severity === "critical" || f.severity === "high");

	const pass = failures.length === 0;

	return {
		pass,
		message: () => {
			const hint = this.utils.matcherHint("toRequireAuthentication", undefined, undefined, {
				isNot: this.isNot,
			});
			if (findings.length === 0) {
				return `${hint}\n\nAuthentication is properly enforced.`;
			}
			const lines = findings.map(
				(f) => `  [${f.severity.toUpperCase()}] ${f.message}\n           Fix: ${f.remediation}`,
			);
			return `${hint}\n\n${lines.join("\n\n")}`;
		},
		name: "toRequireAuthentication",
		expected: "Endpoint requires authentication",
		actual: received,
	};
}
