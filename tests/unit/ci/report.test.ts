import { describe, expect, it, vi } from "vitest";
import { createBaseline, diffFindings, isCouldNotRun } from "../../../src/ci/baseline.js";
import {
	COMMENT_MARKER,
	buildJsonReport,
	evaluateGate,
	parseSeverity,
	toSarif,
	upsertPRComment,
} from "../../../src/ci/report.js";
import type { SecurityFinding } from "../../../src/types/results.js";

function f(id: string, severity: SecurityFinding["severity"] = "high"): SecurityFinding {
	return {
		id,
		category: "headers",
		severity,
		message: `msg ${id}`,
		remediation: `fix ${id}`,
	};
}

describe("isCouldNotRun", () => {
	it("recognises check-error / check-skipped / xss-no-forms ids", () => {
		for (const id of [
			"csrf-check-error",
			"cors-check-error",
			"auth-check-error",
			"xss-check-error",
			"headers-check-skipped",
			"xss-no-forms",
			"csrf-check-unauthenticated",
			"audit-page-closed",
		]) {
			expect(isCouldNotRun({ id })).toBe(true);
		}
		expect(isCouldNotRun({ id: "header-missing-csp" })).toBe(false);
	});
});

describe("baseline never absorbs could-not-run findings", () => {
	it("createBaseline drops them", () => {
		const b = createBaseline([f("header-missing-csp"), f("csrf-check-error")]);
		expect(b.entries.map((e) => e.id)).toEqual(["header-missing-csp"]);
	});

	it("diffFindings classifies them as new even if a hand-edited baseline lists them", () => {
		const baseline = {
			version: 1 as const,
			timestamp: "",
			entries: [
				{ id: "header-missing-csp", severity: "high" as const, url: "", firstSeen: "" },
				{ id: "csrf-check-error", severity: "high" as const, url: "", firstSeen: "" },
			],
		};
		const diff = diffFindings([f("header-missing-csp"), f("csrf-check-error")], baseline);
		expect(diff.existing.map((x) => x.id)).toEqual(["header-missing-csp"]);
		expect(diff.new.map((x) => x.id)).toEqual(["csrf-check-error"]);
	});
});

describe("evaluateGate", () => {
	const known = f("header-missing-csp", "high");
	const fresh = f("cookie-missing-secure", "high");
	const minor = f("header-missing-referrer-policy", "low");

	it("without a baseline, blocks every finding at or above the threshold", () => {
		const g = evaluateGate([known, fresh, minor], "high");
		expect(g.passed).toBe(false);
		expect(g.blocking.map((x) => x.id)).toEqual([known.id, fresh.id]);
	});

	it("with a baseline, blocks only new findings", () => {
		const baseline = createBaseline([known]);
		const diff = diffFindings([known, minor], baseline);
		expect(evaluateGate([known, minor], "high", diff).passed).toBe(true);
		const diff2 = diffFindings([known, fresh], baseline);
		expect(evaluateGate([known, fresh], "high", diff2).blocking.map((x) => x.id)).toEqual([
			fresh.id,
		]);
	});

	it("blocks a could-not-run finding regardless of the baseline", () => {
		const cnr = f("cors-check-error", "high");
		const baseline = createBaseline([known, cnr]);
		const diff = diffFindings([known, cnr], baseline);
		const g = evaluateGate([known, cnr], "high", diff);
		expect(g.passed).toBe(false);
		expect(g.blocking.map((x) => x.id)).toEqual([cnr.id]);
	});
});

describe("buildJsonReport", () => {
	it("flags blocking, baseline status, could-not-run, and includes remediation", () => {
		const findings = [f("header-missing-csp"), f("csrf-check-error")];
		const diff = diffFindings(findings, createBaseline([findings[0] as SecurityFinding]));
		const gate = evaluateGate(findings, "high", diff);
		const r = buildJsonReport({
			url: "https://x.test",
			findings,
			score: 80,
			threshold: "high",
			gate,
			diff,
			version: "9.9.9",
			now: new Date(0),
		});
		expect(r.schemaVersion).toBe(1);
		expect(r.passed).toBe(false);
		expect(r.findings.map((x) => [x.id, x.baseline, x.blocking, x.couldNotRun])).toEqual([
			["header-missing-csp", "existing", false, false],
			["csrf-check-error", "new", true, true],
		]);
		expect(r.remediation.framework).toBe("generic");
		expect(Array.isArray(r.remediation.suggestions)).toBe(true);
	});
});

type SarifResult = {
	locations: { physicalLocation: { artifactLocation: { uri: string; uriBaseId?: string } } }[];
	properties: { url: string };
	message: { text: string };
};

describe("toSarif", () => {
	it("emits SARIF 2.1.0 with one rule per id, levels, and fingerprints", () => {
		const findings = [
			{ ...f("header-missing-csp", "critical"), cweId: "CWE-693", url: "https://x.test/a" },
			f("header-missing-csp", "critical"),
			f("cookie-missing-httponly", "low"),
		];
		const sarif = toSarif(findings, { url: "https://x.test", version: "1.0.0" }) as {
			version: string;
			runs: {
				tool: { driver: { rules: { id: string; properties: Record<string, unknown> }[] } };
				results: Record<string, unknown>[];
			}[];
		};
		expect(sarif.version).toBe("2.1.0");
		const run = sarif.runs[0];
		expect(run?.tool.driver.rules.map((r) => r.id)).toEqual([
			"header-missing-csp",
			"cookie-missing-httponly",
		]);
		expect(run?.tool.driver.rules[0]?.properties["security-severity"]).toBe("9.5");
		expect(run?.tool.driver.rules[0]?.properties.tags).toContain("external/cwe/cwe-693");
		expect(run?.results.map((r) => r.level)).toEqual(["error", "error", "note"]);
		expect(run?.results[0]?.partialFingerprints).toEqual({
			"kovarFinding/v1": "header-missing-csp|https://x.test/a",
		});
		expect(run?.results[2]?.ruleIndex).toBe(1);
	});

	it("anchors results to a repo file (GitHub rejects http artifact URIs) and keeps the URL", () => {
		const sarif = toSarif([{ ...f("header-missing-csp"), url: "http://localhost:4789/x" }], {
			url: "http://localhost:4789",
			version: "1.0.0",
			locationUri: "./web/package.json",
		}) as { runs: { results: SarifResult[] }[] };
		const r = sarif.runs[0]?.results[0];
		const loc = r?.locations[0].physicalLocation.artifactLocation;
		expect(loc).toEqual({ uri: "web/package.json", uriBaseId: "%SRCROOT%" });
		expect(JSON.stringify(sarif)).not.toMatch(/"uri":\s*"https?:/);
		expect(r?.properties.url).toBe("http://localhost:4789/x");
		expect(r?.message.text).toContain("http://localhost:4789/x");
	});

	it("defaults the location to package.json", () => {
		const sarif = toSarif([f("header-missing-csp")], { url: "https://x.test", version: "1" }) as {
			runs: { results: SarifResult[] }[];
		};
		expect(sarif.runs[0]?.results[0]?.locations[0].physicalLocation.artifactLocation.uri).toBe(
			"package.json",
		);
	});
});

describe("upsertPRComment", () => {
	const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

	it("updates the existing marked comment", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				ok([
					{ id: 1, body: "unrelated" },
					{ id: 7, body: `${COMMENT_MARKER}\nold` },
				]),
			)
			.mockResolvedValueOnce(ok({}));
		const r = await upsertPRComment({
			body: "new",
			token: "t",
			repo: "o/r",
			prNumber: 3,
			fetchImpl,
		});
		expect(r).toBe("updated");
		expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://api.github.com/repos/o/r/issues/comments/7");
		expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("PATCH");
	});

	it("creates a comment when none is marked", async () => {
		const fetchImpl = vi.fn().mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok({}));
		const r = await upsertPRComment({
			body: "new",
			token: "t",
			repo: "o/r",
			prNumber: 3,
			fetchImpl,
		});
		expect(r).toBe("created");
		expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("POST");
		expect(JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string).body).toContain(COMMENT_MARKER);
	});
});

describe("parseSeverity (fail-on input)", () => {
	it("accepts the five severities case-insensitively", () => {
		expect(parseSeverity("high")).toBe("high");
		expect(parseSeverity(" High ")).toBe("high");
		expect(parseSeverity("CRITICAL")).toBe("critical");
	});

	it("rejects anything else instead of silently never blocking", () => {
		expect(parseSeverity("hgih")).toBeNull();
		expect(parseSeverity("")).toBeNull();
		expect(parseSeverity("error")).toBeNull();
	});
});
