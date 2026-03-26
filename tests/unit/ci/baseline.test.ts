import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createBaseline,
	diffFindings,
	loadBaseline,
	saveBaseline,
} from "../../../src/ci/baseline.js";
import type { BaselineFile } from "../../../src/ci/baseline.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function makeFinding(overrides: Partial<SecurityFinding> & { id: string }): SecurityFinding {
	return {
		category: "headers",
		severity: "medium",
		message: "Test finding",
		remediation: "Fix it",
		...overrides,
	};
}

describe("createBaseline", () => {
	it("creates a valid baseline structure", () => {
		const findings = [
			makeFinding({ id: "header-missing-csp", severity: "critical", url: "https://example.com" }),
			makeFinding({ id: "cookie-missing-secure", severity: "high" }),
		];

		const baseline = createBaseline(findings);

		expect(baseline.version).toBe(1);
		expect(baseline.timestamp).toBeTruthy();
		expect(new Date(baseline.timestamp).toISOString()).toBe(baseline.timestamp);
		expect(baseline.entries).toHaveLength(2);
		expect(baseline.entries[0]).toEqual({
			id: "header-missing-csp",
			severity: "critical",
			url: "https://example.com",
			firstSeen: baseline.timestamp,
		});
		expect(baseline.entries[1]).toEqual({
			id: "cookie-missing-secure",
			severity: "high",
			url: "",
			firstSeen: baseline.timestamp,
		});
	});

	it("creates an empty baseline from no findings", () => {
		const baseline = createBaseline([]);

		expect(baseline.version).toBe(1);
		expect(baseline.entries).toHaveLength(0);
	});
});

describe("loadBaseline", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kovar-baseline-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns null for missing file", () => {
		const result = loadBaseline(join(tempDir, "nonexistent.json"));
		expect(result).toBeNull();
	});

	it("parses valid JSON", () => {
		const baseline: BaselineFile = {
			version: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
			entries: [
				{
					id: "header-missing-csp",
					severity: "critical",
					url: "https://example.com",
					firstSeen: "2026-01-01T00:00:00.000Z",
				},
			],
		};
		const filePath = join(tempDir, "baseline.json");
		require("node:fs").writeFileSync(filePath, JSON.stringify(baseline));

		const result = loadBaseline(filePath);

		expect(result).toEqual(baseline);
	});

	it("returns null for invalid JSON", () => {
		const filePath = join(tempDir, "bad.json");
		require("node:fs").writeFileSync(filePath, "not-json{{{");

		const result = loadBaseline(filePath);
		expect(result).toBeNull();
	});
});

describe("saveBaseline", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kovar-baseline-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("writes baseline to disk", () => {
		const findings = [
			makeFinding({ id: "header-missing-hsts", severity: "high", url: "https://example.com" }),
		];
		const filePath = join(tempDir, "baseline.json");

		saveBaseline(findings, filePath);

		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as BaselineFile;
		expect(parsed.version).toBe(1);
		expect(parsed.entries).toHaveLength(1);
		expect(parsed.entries[0].id).toBe("header-missing-hsts");
	});
});

describe("diffFindings", () => {
	it("treats all findings as new when baseline is null", () => {
		const current = [makeFinding({ id: "f1" }), makeFinding({ id: "f2" })];

		const diff = diffFindings(current, null);

		expect(diff.new).toHaveLength(2);
		expect(diff.existing).toHaveLength(0);
		expect(diff.resolved).toHaveLength(0);
	});

	it("treats all findings as existing when all match baseline", () => {
		const current = [makeFinding({ id: "f1" }), makeFinding({ id: "f2" })];
		const baseline: BaselineFile = {
			version: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
			entries: [
				{ id: "f1", severity: "medium", url: "", firstSeen: "2026-01-01T00:00:00.000Z" },
				{ id: "f2", severity: "medium", url: "", firstSeen: "2026-01-01T00:00:00.000Z" },
			],
		};

		const diff = diffFindings(current, baseline);

		expect(diff.new).toHaveLength(0);
		expect(diff.existing).toHaveLength(2);
		expect(diff.resolved).toHaveLength(0);
	});

	it("identifies mixed new and existing findings", () => {
		const current = [
			makeFinding({ id: "existing-1" }),
			makeFinding({ id: "new-1" }),
			makeFinding({ id: "new-2" }),
		];
		const baseline: BaselineFile = {
			version: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
			entries: [
				{ id: "existing-1", severity: "medium", url: "", firstSeen: "2026-01-01T00:00:00.000Z" },
			],
		};

		const diff = diffFindings(current, baseline);

		expect(diff.new).toHaveLength(2);
		expect(diff.new.map((f) => f.id)).toEqual(["new-1", "new-2"]);
		expect(diff.existing).toHaveLength(1);
		expect(diff.existing[0].id).toBe("existing-1");
		expect(diff.resolved).toHaveLength(0);
	});

	it("identifies resolved entries", () => {
		const current = [makeFinding({ id: "f1" })];
		const baseline: BaselineFile = {
			version: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
			entries: [
				{ id: "f1", severity: "medium", url: "", firstSeen: "2026-01-01T00:00:00.000Z" },
				{ id: "f2-resolved", severity: "high", url: "", firstSeen: "2026-01-01T00:00:00.000Z" },
				{ id: "f3-resolved", severity: "critical", url: "", firstSeen: "2026-01-01T00:00:00.000Z" },
			],
		};

		const diff = diffFindings(current, baseline);

		expect(diff.new).toHaveLength(0);
		expect(diff.existing).toHaveLength(1);
		expect(diff.resolved).toHaveLength(2);
		expect(diff.resolved.map((e) => e.id)).toEqual(["f2-resolved", "f3-resolved"]);
	});

	it("handles empty baseline entries", () => {
		const current = [makeFinding({ id: "f1" })];
		const baseline: BaselineFile = {
			version: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
			entries: [],
		};

		const diff = diffFindings(current, baseline);

		expect(diff.new).toHaveLength(1);
		expect(diff.existing).toHaveLength(0);
		expect(diff.resolved).toHaveLength(0);
	});

	it("handles empty current findings", () => {
		const baseline: BaselineFile = {
			version: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
			entries: [{ id: "f1", severity: "medium", url: "", firstSeen: "2026-01-01T00:00:00.000Z" }],
		};

		const diff = diffFindings([], baseline);

		expect(diff.new).toHaveLength(0);
		expect(diff.existing).toHaveLength(0);
		expect(diff.resolved).toHaveLength(1);
		expect(diff.resolved[0].id).toBe("f1");
	});

	it("matches findings by ID", () => {
		const current = [
			makeFinding({ id: "header-missing-csp", severity: "critical", message: "Updated message" }),
		];
		const baseline: BaselineFile = {
			version: 1,
			timestamp: "2026-01-01T00:00:00.000Z",
			entries: [
				{
					id: "header-missing-csp",
					severity: "high",
					url: "",
					firstSeen: "2026-01-01T00:00:00.000Z",
				},
			],
		};

		const diff = diffFindings(current, baseline);

		expect(diff.existing).toHaveLength(1);
		expect(diff.existing[0].id).toBe("header-missing-csp");
		expect(diff.existing[0].severity).toBe("critical");
		expect(diff.new).toHaveLength(0);
	});
});
