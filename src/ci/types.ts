import type { SecurityFinding, Severity } from "../types/results.js";

export interface CICheckOptions {
	url: string;
	checks: string[];
	failOn: Severity;
	comment: boolean;
	githubToken?: string | undefined;
}

export interface CICheckResult {
	url: string;
	findings: SecurityFinding[];
	score: number;
	passed: boolean;
	threshold: Severity;
}

const SEVERITY_ORDER: Record<Severity, number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
	info: 0,
};

export function meetsThreshold(finding: SecurityFinding, threshold: Severity): boolean {
	return SEVERITY_ORDER[finding.severity] >= SEVERITY_ORDER[threshold];
}

export function calculateScore(findings: SecurityFinding[]): number {
	let score = 100;
	for (const f of findings) {
		switch (f.severity) {
			case "critical":
				score -= 20;
				break;
			case "high":
				score -= 10;
				break;
			case "medium":
				score -= 5;
				break;
			case "low":
				score -= 2;
				break;
		}
	}
	return Math.max(0, score);
}
