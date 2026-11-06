import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { analyzeCookies, mapPlaywrightCookies } from "../checks/cookies.js";
import { analyzeHeaders } from "../checks/headers.js";
import { detectFramework } from "../remediation/frameworks.js";
import type { SecurityFinding, Severity } from "../types/results.js";
import { diffFindings, loadBaseline, saveBaseline } from "./baseline.js";
import { formatPRComment } from "./github-comment.js";
import { buildJsonReport, evaluateGate, toSarif, upsertPRComment } from "./report.js";
import { calculateScore } from "./types.js";
import type { CICheckOptions, CICheckResult } from "./types.js";

export const SUPPORTED_CHECKS = ["headers", "cookies"] as const;

async function collectFindings(url: string, checks: string[]): Promise<SecurityFinding[]> {
	// Resolve the browser through the @playwright/test peer dependency rather than
	// playwright-core, which is not a direct dependency and is not resolvable under
	// strict installers (pnpm, Yarn PnP).
	const { chromium } = await import("@playwright/test");
	const browser = await chromium.launch({ headless: true });
	const findings: SecurityFinding[] = [];

	try {
		const context = await browser.newContext();
		const page = await context.newPage();

		const response = await page.goto(url, { waitUntil: "networkidle" });
		if (!response) {
			throw new Error(`Failed to navigate to ${url}`);
		}

		if (checks.includes("headers")) {
			const headers = response.headers();
			findings.push(...analyzeHeaders(headers));
		}

		if (checks.includes("cookies")) {
			const rawCookies = await context.cookies();
			const mapped = mapPlaywrightCookies(rawCookies);
			findings.push(...analyzeCookies(mapped));
		}

		await context.close();
	} finally {
		await browser.close();
	}

	return findings;
}

export async function runSecurityCheck(options: CICheckOptions): Promise<CICheckResult> {
	const findings = await collectFindings(options.url, options.checks);
	const score = calculateScore(findings);
	const baseline = options.baselinePath ? loadBaseline(options.baselinePath) : null;
	const diff = options.baselinePath ? diffFindings(findings, baseline) : undefined;
	const gate = evaluateGate(findings, options.failOn, diff);

	return {
		url: options.url,
		findings,
		score,
		passed: gate.passed,
		threshold: options.failOn,
		diff,
		blocking: gate.blocking,
	};
}

function getInput(name: string, fallback?: string): string {
	const envName = `INPUT_${name.toUpperCase().replace(/-/g, "_")}`;
	const value = process.env[envName];
	return value !== undefined && value !== "" ? value : (fallback ?? "");
}

function setOutput(name: string, value: string): void {
	const outputFile = process.env.GITHUB_OUTPUT;
	if (outputFile) {
		appendFileSync(outputFile, `${name}=${value}\n`);
	}
}

function kovarVersion(): string {
	try {
		// dist/ci/index.js -> package.json
		const require = createRequire(import.meta.url);
		return (require("../../package.json") as { version: string }).version;
	} catch {
		return "0.0.0";
	}
}

function pullRequestNumber(): number | undefined {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) return undefined;
	try {
		const event = JSON.parse(readFileSync(eventPath, "utf-8"));
		const n = event?.pull_request?.number;
		return typeof n === "number" ? n : undefined;
	} catch {
		return undefined;
	}
}

async function main(): Promise<void> {
	const url = getInput("url");
	if (!url) {
		console.error("Error: 'url' input is required");
		process.exit(1);
	}

	const checks = getInput("checks", "headers,cookies")
		.split(",")
		.map((c) => c.trim())
		.filter(Boolean);
	const unsupported = checks.filter((c) => !(SUPPORTED_CHECKS as readonly string[]).includes(c));
	if (unsupported.length > 0) {
		// Fail loudly instead of silently skipping: a skipped check must never read as a pass.
		console.error(
			`Error: unsupported check(s): ${unsupported.join(", ")}. Supported: ${SUPPORTED_CHECKS.join(", ")}`,
		);
		process.exit(1);
	}
	const failOn = getInput("fail-on", "high") as Severity;
	const shouldComment = getInput("comment", "true") === "true";
	const githubToken = getInput("github-token", "");
	const baselinePath = getInput("baseline-path", "") || undefined;
	const shouldUpdateBaseline = getInput("update-baseline", "false") === "true";
	const outputDir = resolve(getInput("output-dir", "kovar-results"));
	const frameworkPkg = getInput("framework-package-json", "package.json");

	const result = await runSecurityCheck({
		url,
		checks,
		failOn,
		comment: shouldComment,
		githubToken: githubToken || undefined,
		baselinePath,
		updateBaseline: shouldUpdateBaseline,
	});

	if (shouldUpdateBaseline && baselinePath) {
		saveBaseline(result.findings, baselinePath);
	}

	const version = kovarVersion();
	const report = buildJsonReport({
		url: result.url,
		findings: result.findings,
		score: result.score,
		threshold: failOn,
		gate: { passed: result.passed, blocking: result.blocking ?? [] },
		diff: result.diff,
		version,
		framework: detectFramework(frameworkPkg),
	});
	mkdirSync(outputDir, { recursive: true });
	const jsonPath = join(outputDir, "kovar-report.json");
	const sarifPath = join(outputDir, "kovar.sarif");
	writeFileSync(jsonPath, JSON.stringify(report, null, 2));
	writeFileSync(sarifPath, JSON.stringify(toSarif(result.findings, { url, version }), null, 2));

	setOutput("score", String(result.score));
	setOutput("findings-count", String(result.findings.length));
	setOutput("blocking-count", String(report.findings.filter((f) => f.blocking).length));
	setOutput("passed", String(result.passed));
	setOutput("json-path", jsonPath);
	setOutput("sarif-path", sarifPath);

	const comment = formatPRComment(result.findings, {
		url: result.url,
		score: result.score,
		threshold: result.threshold,
		passed: result.passed,
		diff: result.diff,
	});

	console.log(comment);

	const summaryFile = process.env.GITHUB_STEP_SUMMARY;
	if (summaryFile) {
		appendFileSync(summaryFile, `${comment}\n`);
	}

	const prNumber = pullRequestNumber();
	const repo = process.env.GITHUB_REPOSITORY;
	if (shouldComment && githubToken && prNumber !== undefined && repo) {
		try {
			await upsertPRComment({
				body: comment,
				token: githubToken,
				repo,
				prNumber,
				...(process.env.GITHUB_API_URL ? { apiUrl: process.env.GITHUB_API_URL } : {}),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`Warning: Failed to post PR comment: ${msg}`);
		}
	}

	if (!result.passed) {
		const ids = (result.blocking ?? []).map((f) => f.id).join(", ");
		console.error(
			`\nSecurity check failed: ${baselinePath ? "new " : ""}findings at or above "${failOn}" severity, or checks that could not run: ${ids}`,
		);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
