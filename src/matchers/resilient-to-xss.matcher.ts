import type { ExpectMatcherState, Page } from "@playwright/test";
import { XSSScanner } from "../checks/xss.js";
import type { XSSCheckOptions } from "../types/index.js";
import { formatMatcherMessage } from "../utils/matcher-helpers.js";

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
		message: () =>
			formatMatcherMessage(
				result.findings,
				"toBeResilientToXSS",
				`No XSS vulnerabilities detected (${result.payloadsTested} payloads tested).`,
				this.utils,
				this.isNot,
			),
		name: "toBeResilientToXSS",
		expected: "No XSS vulnerabilities",
		actual: received,
	};
}
