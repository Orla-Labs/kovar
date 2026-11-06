import type { SecurityFinding } from "../types/results.js";

const FAMILY_BY_PREFIX: Record<string, string> = {
	header: "headers",
	headers: "headers",
	cookie: "cookies",
	xss: "xss",
	csrf: "csrf",
	cors: "cors",
	auth: "auth",
};

function familyOf(id: string): string {
	const prefix = id.split("-")[0] ?? id;
	return FAMILY_BY_PREFIX[prefix] ?? prefix;
}

/**
 * Which check families actually ran. Absence of a finding only proves a
 * requirement passed if the check that would have produced it was run, so
 * without an explicit `checksRun` list a family counts as run only when the
 * findings contain at least one of its IDs.
 */
export function resolveChecksRun(
	findings: SecurityFinding[],
	checksRun: readonly string[] | undefined,
): Set<string> {
	if (checksRun) return new Set(checksRun.map((c) => FAMILY_BY_PREFIX[c] ?? c));
	return new Set(findings.map((f) => familyOf(f.id)));
}

export function requirementWasTested(checkIds: readonly string[], ran: Set<string>): boolean {
	return checkIds.length > 0 && checkIds.every((id) => ran.has(familyOf(id)));
}
