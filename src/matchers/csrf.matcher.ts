import type { APIRequestContext, ExpectMatcherState } from "@playwright/test";
import { type CSRFCheckOptions, checkCSRF } from "../checks/csrf.js";

export async function toBeCSRFProtected(
	this: ExpectMatcherState,
	received: APIRequestContext,
	url: string,
	options?: CSRFCheckOptions,
) {
	const findings = await checkCSRF(received, url, options);
	const failures = findings.filter((f) => f.severity === "critical" || f.severity === "high");

	const pass = failures.length === 0;

	return {
		pass,
		message: () => {
			const hint = this.utils.matcherHint("toBeCSRFProtected", undefined, undefined, {
				isNot: this.isNot,
			});
			if (findings.length === 0) {
				return `${hint}\n\nCSRF protection is properly configured.`;
			}
			const lines = findings.map(
				(f) => `  [${f.severity.toUpperCase()}] ${f.message}\n           Fix: ${f.remediation}`,
			);
			return `${hint}\n\n${lines.join("\n\n")}`;
		},
		name: "toBeCSRFProtected",
		expected: "Endpoint is protected against CSRF attacks",
		actual: received,
	};
}
