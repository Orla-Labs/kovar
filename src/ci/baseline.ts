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

	return {
		new: current.filter((f) => !baselineIds.has(f.id)),
		existing: current.filter((f) => baselineIds.has(f.id)),
		resolved: baseline.entries.filter((e) => !currentIds.has(e.id)),
	};
}

export function createBaseline(findings: SecurityFinding[]): BaselineFile {
	const timestamp = new Date().toISOString();
	return {
		version: 1,
		timestamp,
		entries: findings.map((f) => ({
			id: f.id,
			severity: f.severity,
			url: f.url ?? "",
			firstSeen: timestamp,
		})),
	};
}
