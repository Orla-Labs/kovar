import type { SecurityFinding } from "../types/results.js";
import { remediateCookies } from "./cookies.js";
import { remediateHeaders } from "./headers.js";
import type { Framework, RemediationReport } from "./types.js";

export type { Framework, RemediationReport, RemediationSuggestion } from "./types.js";

export function generateRemediation(
	findings: SecurityFinding[],
	options?: { framework?: Framework; language?: "typescript" | "javascript" },
): RemediationReport {
	const framework = options?.framework ?? "generic";
	const language = options?.language ?? "typescript";

	const headers = remediateHeaders(findings, framework, language);
	const cookies = remediateCookies(findings, framework, language);

	const suggestions = [...headers.suggestions, ...cookies.suggestions];
	const unsupported = [...headers.unsupported, ...cookies.unsupported];

	const unsupportedFromOtherCategories = findings
		.filter((f) => f.category !== "headers" && f.category !== "cookies")
		.map((f) => f.id);

	return {
		findings: findings.length,
		suggestions,
		unsupported: [...unsupported, ...unsupportedFromOtherCategories],
	};
}
