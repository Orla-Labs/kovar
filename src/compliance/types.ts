import type { SecurityFinding } from "../types/results.js";

export interface ComplianceRequirement {
	id: string;
	standard: "owasp-asvs" | "pci-dss" | "soc2";
	title: string;
	description: string;
	level?: number;
	kovarCheckIds: string[];
	status: "pass" | "fail" | "not-tested";
	findings: SecurityFinding[];
}

export interface ComplianceReport {
	standard: string;
	version: string;
	timestamp: string;
	summary: {
		total: number;
		passed: number;
		failed: number;
		notTested: number;
		coverage: number;
	};
	requirements: ComplianceRequirement[];
}

export type ComplianceReportFormat = "json" | "markdown" | "text";
