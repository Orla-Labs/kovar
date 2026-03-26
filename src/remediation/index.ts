import type { SecurityFinding } from "../types/results.js";
import { remediateAuth } from "./auth.js";
import { remediateCookies } from "./cookies.js";
import { remediateCORS } from "./cors.js";
import { remediateCSRF } from "./csrf.js";
import { remediateHeaders } from "./headers.js";
import type { Framework, RemediationReport } from "./types.js";
import { remediateXSS } from "./xss.js";

export type { Framework, RemediationReport, RemediationSuggestion } from "./types.js";

const HANDLED_ID_PREFIXES = ["csrf-", "cors-", "auth-"];

function isHandledByIdPrefix(finding: SecurityFinding): boolean {
	return HANDLED_ID_PREFIXES.some((prefix) => finding.id.startsWith(prefix));
}

export function generateRemediation(
	findings: SecurityFinding[],
	options?: { framework?: Framework; language?: "typescript" | "javascript" },
): RemediationReport {
	const framework = options?.framework ?? "generic";
	const language = options?.language ?? "typescript";

	const headers = remediateHeaders(findings, framework, language);
	const cookies = remediateCookies(findings, framework, language);
	const xss = remediateXSS(findings, framework, language);
	const csrf = remediateCSRF(findings, framework, language);
	const cors = remediateCORS(findings, framework, language);
	const auth = remediateAuth(findings, framework, language);

	const suggestions = [
		...headers.suggestions,
		...cookies.suggestions,
		...xss.suggestions,
		...csrf.suggestions,
		...cors.suggestions,
		...auth.suggestions,
	];
	const unsupported = [
		...headers.unsupported,
		...cookies.unsupported,
		...xss.unsupported,
		...csrf.unsupported,
		...cors.unsupported,
		...auth.unsupported,
	];

	const handledCategories = new Set(["headers", "cookies", "xss"]);
	const unsupportedFromOtherCategories = findings
		.filter((f) => !handledCategories.has(f.category) && !isHandledByIdPrefix(f))
		.map((f) => f.id);

	return {
		findings: findings.length,
		suggestions,
		unsupported: [...unsupported, ...unsupportedFromOtherCategories],
	};
}
