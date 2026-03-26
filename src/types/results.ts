export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
	| "headers"
	| "cookies"
	| "xss"
	| "authentication"
	| "access-control"
	| "injection"
	| "cryptography"
	| "configuration"
	| "secrets"
	| "information-disclosure";

export interface SecurityFinding {
	id: string;
	category: FindingCategory;
	severity: Severity;
	message: string;
	remediation: string;
	url?: string;
	header?: string;
	cookie?: string;
	payload?: string;
	evidence?: string;
	cweId?: string;
	cvssScore?: number;
	cvssVector?: string;
	references?: string[];
}

export interface SecuritySummary {
	total: number;
	critical: number;
	high: number;
	medium: number;
	low: number;
	info: number;
}

export interface SecurityReport {
	url: string;
	timestamp: string;
	duration: number;
	findings: SecurityFinding[];
	summary: SecuritySummary;
}

export function summarize(findings: SecurityFinding[]): SecuritySummary {
	return {
		total: findings.length,
		critical: findings.filter((f) => f.severity === "critical").length,
		high: findings.filter((f) => f.severity === "high").length,
		medium: findings.filter((f) => f.severity === "medium").length,
		low: findings.filter((f) => f.severity === "low").length,
		info: findings.filter((f) => f.severity === "info").length,
	};
}
