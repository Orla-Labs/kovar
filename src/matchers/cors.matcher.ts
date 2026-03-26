import type { APIRequestContext, ExpectMatcherState } from "@playwright/test";
import { type CORSCheckOptions, checkCORS } from "../checks/cors.js";

export async function toHaveSecureCORS(
	this: ExpectMatcherState,
	received: APIRequestContext,
	url: string,
	options?: CORSCheckOptions,
) {
	const findings = await checkCORS(received, url, options);
	const failures = findings.filter((f) => f.severity === "critical" || f.severity === "high");

	const pass = failures.length === 0;

	return {
		pass,
		message: () => {
			const hint = this.utils.matcherHint("toHaveSecureCORS", undefined, undefined, {
				isNot: this.isNot,
			});
			if (findings.length === 0) {
				return `${hint}\n\nCORS is properly configured.`;
			}
			const lines = findings.map(
				(f) => `  [${f.severity.toUpperCase()}] ${f.message}\n           Fix: ${f.remediation}`,
			);
			return `${hint}\n\n${lines.join("\n\n")}`;
		},
		name: "toHaveSecureCORS",
		expected: "CORS is securely configured",
		actual: received,
	};
}
