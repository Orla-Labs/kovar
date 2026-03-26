import type { ExpectMatcherState, Page } from "@playwright/test";
import { XSSScanner } from "../checks/xss.js";
import type { XSSCheckOptions } from "../types/index.js";

export async function toBeResilientToXSS(
	this: ExpectMatcherState,
	received: Page,
	options?: XSSCheckOptions,
) {
	const request = received.context().request;
	const scanner = new XSSScanner(received, request);
	const result = await scanner.scan(options);

	const pass = result.findings.length === 0;

	return {
		pass,
		message: () => {
			const hint = this.utils.matcherHint("toBeResilientToXSS", undefined, undefined, {
				isNot: this.isNot,
			});
			if (result.findings.length === 0) {
				return `${hint}\n\nNo XSS vulnerabilities detected (${result.payloadsTested} payloads tested).`;
			}
			const lines = result.findings.map(
				(f) =>
					`  [CRITICAL] ${f.message}\n           Payload: ${f.payload}\n           Fix: ${f.remediation}`,
			);
			return `${hint}\n\n${lines.join("\n\n")}`;
		},
		name: "toBeResilientToXSS",
		expected: "No XSS vulnerabilities",
		actual: received,
	};
}
