import type { APIResponse, ExpectMatcherState, Response } from "@playwright/test";
import { analyzeHeaders } from "../checks/headers.js";
import type { HeaderCheckOptions } from "../types/index.js";

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
	const failures = findings.filter((f) => f.severity === "critical" || f.severity === "high");

	const pass = failures.length === 0;

	return {
		pass,
		message: () => {
			const hint = this.utils.matcherHint("toHaveSecureHeaders", undefined, undefined, {
				isNot: this.isNot,
			});
			if (findings.length === 0) {
				return `${hint}\n\nAll security headers are properly configured.`;
			}
			const lines = findings.map(
				(f) =>
					`  [${f.severity.toUpperCase()}] ${f.header}: ${f.message}\n           Fix: ${f.remediation}`,
			);
			return `${hint}\n\n${lines.join("\n\n")}`;
		},
		name: "toHaveSecureHeaders",
		expected: "All security headers properly configured",
		actual: findings,
	};
}
