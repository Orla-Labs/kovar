import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBaseline, diffFindings, isCouldNotRun } from "../../../src/ci/baseline.js";
import { evaluateGate } from "../../../src/ci/report.js";
import type { SecurityFinding } from "../../../src/types/index.js";

/**
 * Release gate 6 (v0.7.0 plan): every "could not run" finding ID that src/ can emit must
 * always block. Until a `status: "not-verified"` field replaces ID matching (0.8), this
 * test is the guard: it lists the IDs, scans src/ so the list cannot silently go stale,
 * and checks isCouldNotRun(), createBaseline() and diffFindings() for each.
 */
const COULD_NOT_RUN_IDS = [
	"auth-check-error",
	"cors-check-error",
	"csrf-check-error",
	"csrf-check-unauthenticated",
	"xss-check-error",
	"xss-no-forms",
	"headers-check-skipped",
	"audit-page-closed",
] as const;

// Any finding ID shaped like "the check did not run" (by the naming convention, or the
// three historical exceptions). A new ID matching this must be added above.
const LOOKS_LIKE_COULD_NOT_RUN =
	/-check-(error|skipped|unauthenticated)$|-no-forms$|-page-closed$|-not-run$|-not-verified$/;

const SRC = join(__dirname, "../../../src");

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory())
			return name === "recorder" || name === "mcp" ? [] : sourceFiles(p);
		return p.endsWith(".ts") ? [p] : [];
	});
}

function emittedLiteralIds(): Set<string> {
	const ids = new Set<string>();
	for (const file of sourceFiles(SRC)) {
		for (const m of readFileSync(file, "utf-8").matchAll(/\bid:\s*"([a-z0-9-]+)"/g)) {
			if (m[1]) ids.add(m[1]);
		}
	}
	return ids;
}

const finding = (id: string): SecurityFinding => ({
	id,
	category: "headers",
	severity: "high",
	message: id,
	remediation: "",
});

describe("release gate 6: could-not-run findings always block", () => {
	const emitted = emittedLiteralIds();

	it("the list matches what src/ can emit (no stale or missing IDs)", () => {
		const shaped = [...emitted].filter((id) => LOOKS_LIKE_COULD_NOT_RUN.test(id)).sort();
		expect(shaped).toEqual([...COULD_NOT_RUN_IDS].sort());
	});

	it.each(COULD_NOT_RUN_IDS)("%s is emitted by src/", (id) => {
		expect(emitted.has(id)).toBe(true);
	});

	it.each(COULD_NOT_RUN_IDS)("isCouldNotRun(%s) is true", (id) => {
		expect(isCouldNotRun({ id })).toBe(true);
	});

	it("createBaseline drops every could-not-run ID and keeps real findings", () => {
		const b = createBaseline([finding("header-missing-csp"), ...COULD_NOT_RUN_IDS.map(finding)]);
		expect(b.entries.map((e) => e.id)).toEqual(["header-missing-csp"]);
	});

	it("a hand-edited baseline cannot make them 'existing'", () => {
		const baseline = {
			version: 1 as const,
			timestamp: "",
			entries: COULD_NOT_RUN_IDS.map((id) => ({
				id,
				severity: "high" as const,
				url: "",
				firstSeen: "",
			})),
		};
		const diff = diffFindings(COULD_NOT_RUN_IDS.map(finding), baseline);
		expect(diff.existing).toEqual([]);
		expect(diff.new.map((f) => f.id).sort()).toEqual([...COULD_NOT_RUN_IDS].sort());
	});

	it("evaluateGate blocks them at the default threshold even when a baseline lists them", () => {
		const findings = [finding("header-missing-csp"), ...COULD_NOT_RUN_IDS.map(finding)];
		const baseline = createBaseline([finding("header-missing-csp")]);
		baseline.entries.push(
			...COULD_NOT_RUN_IDS.map((id) => ({ id, severity: "high" as const, url: "", firstSeen: "" })),
		);
		const gate = evaluateGate(findings, "high", diffFindings(findings, baseline));
		expect(gate.passed).toBe(false);
		expect(gate.blocking.map((f) => f.id).sort()).toEqual([...COULD_NOT_RUN_IDS].sort());
	});

	it.each(COULD_NOT_RUN_IDS)(
		"%s is emitted with severity high (blocks at the default fail-on)",
		(id) => {
			const sources = sourceFiles(SRC).map((f) => readFileSync(f, "utf-8"));
			const severities = sources.flatMap((src) =>
				[
					...src.matchAll(new RegExp(`id:\\s*"${id}"[\\s\\S]{0,200}?severity:\\s*"([a-z]+)"`, "g")),
				].map((m) => m[1]),
			);
			expect(severities.length).toBeGreaterThan(0);
			expect(new Set(severities)).toEqual(new Set(["high"]));
		},
	);

	it("no real finding ID is misclassified as could-not-run", () => {
		const misclassified = [...emitted].filter(
			(id) => isCouldNotRun({ id }) && !(COULD_NOT_RUN_IDS as readonly string[]).includes(id),
		);
		expect(misclassified).toEqual([]);
	});
});
