import type { ExpectMatcherState, Page } from "@playwright/test";
import { type AccessibilityCheckOptions, checkAccessibility } from "../checks/accessibility.js";

export async function toBeAccessible(
	this: ExpectMatcherState,
	received: Page,
	options?: AccessibilityCheckOptions,
) {
	const findings = await checkAccessibility(received, options);
	const failures = findings.filter((f) => f.severity === "critical" || f.severity === "high");

	const pass = failures.length === 0;

	return {
		pass,
		message: () => {
			const hint = this.utils.matcherHint("toBeAccessible", undefined, undefined, {
				isNot: this.isNot,
			});
			if (findings.length === 0) {
				return `${hint}\n\nPage meets accessibility requirements.`;
			}
			const lines = findings.map(
				(f) => `  [${f.severity.toUpperCase()}] ${f.message}\n           Fix: ${f.remediation}`,
			);
			return `${hint}\n\n${lines.join("\n\n")}`;
		},
		name: "toBeAccessible",
		expected: "Page meets accessibility requirements",
		actual: received,
	};
}
