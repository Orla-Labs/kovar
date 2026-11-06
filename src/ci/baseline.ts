import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SecurityFinding, Severity } from "../types/results.js";

export interface BaselineEntry {
	id: string;
	severity: Severity;
	url: string;
	firstSeen: string;
}

export interface BaselineFile {
	version: 1;
	timestamp: string;
	entries: BaselineEntry[];
}

export interface BaselineDiff {
	new: SecurityFinding[];
	existing: SecurityFinding[];
	resolved: BaselineEntry[];
}

/**
 * A finding that says a check could not run (endpoint unreachable, check
 * skipped, nothing to test). It means "not verified", not "accepted risk", so
 * it is never written to a baseline and never classified as existing.
 */
export function isCouldNotRun(finding: Pick<SecurityFinding, "id">): boolean {
	return /-check-(error|skipped)$/.test(finding.id) || finding.id === "xss-no-forms";
}

export function loadBaseline(filePath: string): BaselineFile | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		return JSON.parse(raw) as BaselineFile;
	} catch {
		return null;
	}
}

export function saveBaseline(findings: SecurityFinding[], filePath: string): void {
	const baseline = createBaseline(findings);
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(filePath, JSON.stringify(baseline, null, 2), "utf-8");
}

export function diffFindings(
	current: SecurityFinding[],
	baseline: BaselineFile | null,
): BaselineDiff {
	if (!baseline) {
		return { new: current, existing: [], resolved: [] };
	}

	const baselineIds = new Set(baseline.entries.map((e) => e.id));
	const currentIds = new Set(current.map((f) => f.id));

	const isExisting = (f: SecurityFinding) => baselineIds.has(f.id) && !isCouldNotRun(f);
	return {
		new: current.filter((f) => !isExisting(f)),
		existing: current.filter(isExisting),
		resolved: baseline.entries.filter((e) => !currentIds.has(e.id)),
	};
}

export function createBaseline(findings: SecurityFinding[]): BaselineFile {
	const timestamp = new Date().toISOString();
	return {
		version: 1,
		timestamp,
		entries: findings
			.filter((f) => !isCouldNotRun(f))
			.map((f) => ({
				id: f.id,
				severity: f.severity,
				url: f.url ?? "",
				firstSeen: timestamp,
			})),
	};
}
