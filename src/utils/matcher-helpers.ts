import type { SecurityFinding, Severity } from "../types/results.js";

export function filterFailures(
	findings: SecurityFinding[],
	severities: Severity[] = ["critical", "high"],
): SecurityFinding[] {
	return findings.filter((f) => severities.includes(f.severity));
}

export function formatMatcherMessage(
	findings: SecurityFinding[],
	matcherName: string,
	passMessage: string,
	utils: { matcherHint: (name: string, a?: string, b?: string, opts?: object) => string },
	isNot: boolean | undefined,
): string {
	const hint = utils.matcherHint(matcherName, undefined, undefined, { isNot });
	if (findings.length === 0) {
		return `${hint}\n\n${passMessage}`;
	}
	const lines = findings.map((f) => {
		const tag = `[${f.severity.toUpperCase()}]`;
		const subject = f.header ?? f.cookie ?? "";
		const prefix = subject ? `${tag} ${subject}: ` : `${tag} `;
		const extra = f.payload ? `\n           Payload: ${f.payload}` : "";
		return `  ${prefix}${f.message}${extra}\n           Fix: ${f.remediation}`;
	});
	return `${hint}\n\n${lines.join("\n\n")}`;
}
