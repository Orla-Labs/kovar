import { generateRemediation } from "../remediation/index.js";
import type { Framework, RemediationSuggestion } from "../remediation/types.js";
import type { SecurityFinding, Severity } from "../types/results.js";
import { summarize } from "../types/results.js";
import type { BaselineDiff } from "./baseline.js";
import { isCouldNotRun } from "./baseline.js";
import { meetsThreshold } from "./types.js";

export interface GateResult {
	passed: boolean;
	/** Findings that fail the job: new (or all, without a baseline) at/above threshold, plus every could-not-run finding at/above threshold. */
	blocking: SecurityFinding[];
}

/**
 * With a baseline, only findings that are new relative to it block. A
 * could-not-run finding blocks regardless of the baseline: a check that did
 * not run must never read as a pass.
 */
export function evaluateGate(
	findings: SecurityFinding[],
	failOn: Severity,
	diff?: BaselineDiff,
): GateResult {
	const candidates = diff ? diff.new : findings;
	const selected = new Set(candidates);
	for (const f of findings) {
		if (isCouldNotRun(f)) selected.add(f);
	}
	const blocking = [...selected].filter((f) => meetsThreshold(f, failOn));
	return { passed: blocking.length === 0, blocking };
}

export interface KovarJsonReport {
	schemaVersion: 1;
	tool: { name: "kovar"; version: string };
	url: string;
	timestamp: string;
	threshold: Severity;
	passed: boolean;
	score: number;
	summary: ReturnType<typeof summarize>;
	findings: (SecurityFinding & {
		couldNotRun: boolean;
		blocking: boolean;
		baseline: "new" | "existing" | "none";
	})[];
	resolved: string[];
	/** Framework-specific fix suggestions from src/remediation: the input for a future fix-PR mode. */
	remediation: {
		framework: Framework;
		suggestions: RemediationSuggestion[];
		unsupported: string[];
	};
}

export function buildJsonReport(input: {
	url: string;
	findings: SecurityFinding[];
	score: number;
	threshold: Severity;
	gate: GateResult;
	diff?: BaselineDiff | undefined;
	version: string;
	framework?: Framework;
	now?: Date;
}): KovarJsonReport {
	const blocking = new Set(input.gate.blocking);
	const existing = new Set(input.diff?.existing ?? []);
	const framework = input.framework ?? "generic";
	const remediation = generateRemediation(input.findings, { framework });
	return {
		schemaVersion: 1,
		tool: { name: "kovar", version: input.version },
		url: input.url,
		timestamp: (input.now ?? new Date()).toISOString(),
		threshold: input.threshold,
		passed: input.gate.passed,
		score: input.score,
		summary: summarize(input.findings),
		findings: input.findings.map((f) => ({
			...f,
			couldNotRun: isCouldNotRun(f),
			blocking: blocking.has(f),
			baseline: input.diff ? (existing.has(f) ? "existing" : "new") : "none",
		})),
		resolved: (input.diff?.resolved ?? []).map((e) => e.id),
		remediation: {
			framework,
			suggestions: remediation.suggestions,
			unsupported: remediation.unsupported,
		},
	};
}

const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
	critical: "error",
	high: "error",
	medium: "warning",
	low: "note",
	info: "note",
};

// GitHub code scanning maps security-severity to critical (>=9), high (>=7), medium (>=4), low.
const SECURITY_SEVERITY: Record<Severity, string> = {
	critical: "9.5",
	high: "8.0",
	medium: "5.5",
	low: "3.0",
	info: "0.0",
};

/**
 * SARIF 2.1.0. Findings are about a URL, not a source file, so each result
 * carries the scanned URL as its artifact location and a stable
 * partialFingerprint (finding id + URL) for de-duplication across runs.
 */
export function toSarif(
	findings: SecurityFinding[],
	options: { url: string; version: string },
): Record<string, unknown> {
	const rules = new Map<string, Record<string, unknown>>();
	for (const f of findings) {
		if (rules.has(f.id)) continue;
		const tags = ["security", f.category];
		if (f.cweId) tags.push(`external/cwe/${f.cweId.toLowerCase()}`);
		if (isCouldNotRun(f)) tags.push("could-not-run");
		rules.set(f.id, {
			id: f.id,
			name: f.id,
			shortDescription: { text: f.message.split("\n")[0]?.slice(0, 200) ?? f.id },
			help: { text: f.remediation },
			...(f.references?.[0] ? { helpUri: f.references[0] } : {}),
			defaultConfiguration: { level: SARIF_LEVEL[f.severity] },
			properties: {
				tags,
				"security-severity":
					f.cvssScore !== undefined ? f.cvssScore.toFixed(1) : SECURITY_SEVERITY[f.severity],
			},
		});
	}
	const ruleIds = [...rules.keys()];
	return {
		$schema: "https://json.schemastore.org/sarif-2.1.0.json",
		version: "2.1.0",
		runs: [
			{
				tool: {
					driver: {
						name: "Kovar",
						version: options.version,
						informationUri: "https://kovar.orlalabs.com",
						rules: [...rules.values()],
					},
				},
				results: findings.map((f) => {
					const target = f.url ?? options.url;
					return {
						ruleId: f.id,
						ruleIndex: ruleIds.indexOf(f.id),
						level: SARIF_LEVEL[f.severity],
						message: { text: `${f.message}\n\nFix: ${f.remediation}` },
						locations: [{ physicalLocation: { artifactLocation: { uri: target } } }],
						partialFingerprints: { "kovarFinding/v1": `${f.id}|${target}` },
					};
				}),
			},
		],
	};
}

export const COMMENT_MARKER = "<!-- kovar-security-check -->";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Create or update a single Kovar comment on the PR (found by a hidden
 * marker), so repeated runs don't stack comments.
 */
export async function upsertPRComment(input: {
	body: string;
	token: string;
	repo: string;
	prNumber: number;
	apiUrl?: string;
	fetchImpl?: FetchLike;
}): Promise<"created" | "updated"> {
	const fetchImpl = input.fetchImpl ?? fetch;
	const api = input.apiUrl ?? "https://api.github.com";
	const headers = {
		Authorization: `Bearer ${input.token}`,
		"Content-Type": "application/json",
		Accept: "application/vnd.github+json",
	};
	const body = JSON.stringify({ body: `${COMMENT_MARKER}\n${input.body}` });

	const list = await fetchImpl(
		`${api}/repos/${input.repo}/issues/${input.prNumber}/comments?per_page=100`,
		{ headers },
	);
	if (list.ok) {
		const comments = (await list.json()) as { id: number; body?: string }[];
		const mine = comments.find((c) => c.body?.includes(COMMENT_MARKER));
		if (mine) {
			const res = await fetchImpl(`${api}/repos/${input.repo}/issues/comments/${mine.id}`, {
				method: "PATCH",
				headers,
				body,
			});
			if (!res.ok) throw new Error(`GitHub API ${res.status} updating comment`);
			return "updated";
		}
	}
	const res = await fetchImpl(`${api}/repos/${input.repo}/issues/${input.prNumber}/comments`, {
		method: "POST",
		headers,
		body,
	});
	if (!res.ok) throw new Error(`GitHub API ${res.status} creating comment`);
	return "created";
}
