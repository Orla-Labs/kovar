import type { ExpectMatcherState, Page } from "@playwright/test";
import { type AccessibilityCheckOptions, checkAccessibility } from "../checks/accessibility.js";
import { filterFailures, formatMatcherMessage } from "../utils/matcher-helpers.js";

export async function toBeAccessible(
	this: ExpectMatcherState,
	received: Page,
	options?: AccessibilityCheckOptions,
) {
	const findings = await checkAccessibility(received, options);
	const failures = filterFailures(findings);
	const pass = failures.length === 0;

	return {
		pass,
		message: () =>
			formatMatcherMessage(
				findings,
				"toBeAccessible",
				"Page meets accessibility requirements.",
				this.utils,
				this.isNot,
			),
		name: "toBeAccessible",
		expected: "Page meets accessibility requirements",
		actual: received,
	};
}
