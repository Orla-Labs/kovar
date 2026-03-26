import { analyzeCookies, mapPlaywrightCookies } from "../checks/cookies.js";
import { analyzeHeaders } from "../checks/headers.js";
import type { SecurityFinding, Severity } from "../types/results.js";
import { diffFindings, loadBaseline, saveBaseline } from "./baseline.js";
import { formatPRComment } from "./github-comment.js";
import { calculateScore, meetsThreshold } from "./types.js";
import type { CICheckOptions, CICheckResult } from "./types.js";

async function collectFindings(url: string, checks: string[]): Promise<SecurityFinding[]> {
	const { chromium } = await import("playwright-core");
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
	const hasFailure = findings.some((f) => meetsThreshold(f, options.failOn));

	return {
		url: options.url,
		findings,
		score,
		passed: !hasFailure,
		threshold: options.failOn,
	};
}

function getInput(name: string, fallback?: string): string {
	const envName = `INPUT_${name.toUpperCase().replace(/-/g, "_")}`;
	return process.env[envName] ?? fallback ?? "";
}

function setOutput(name: string, value: string): void {
	const outputFile = process.env.GITHUB_OUTPUT;
	if (outputFile) {
		const { appendFileSync } = require("node:fs") as typeof import("node:fs");
		appendFileSync(outputFile, `${name}=${value}\n`);
	}
}

async function postPRComment(comment: string, token: string): Promise<void> {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) return;

	const { readFileSync } = require("node:fs") as typeof import("node:fs");
	const event = JSON.parse(readFileSync(eventPath, "utf-8"));
	const prNumber = event?.pull_request?.number;
	if (!prNumber) return;

	const repo = process.env.GITHUB_REPOSITORY;
	if (!repo) return;

	const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
	await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/vnd.github+json",
		},
		body: JSON.stringify({ body: comment }),
	});
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
	const failOn = getInput("fail-on", "high") as Severity;
	const shouldComment = getInput("comment", "true") === "true";
	const githubToken = getInput("github-token", "");

	const baselinePath = getInput("baseline-path", "") || undefined;
	const shouldUpdateBaseline = getInput("update-baseline", "false") === "true";

	const result = await runSecurityCheck({
		url,
		checks,
		failOn,
		comment: shouldComment,
		githubToken: githubToken || undefined,
		baselinePath,
		updateBaseline: shouldUpdateBaseline,
	});

	const baseline = baselinePath ? loadBaseline(baselinePath) : null;
	const diff = baselinePath ? diffFindings(result.findings, baseline) : undefined;
	result.diff = diff;

	if (shouldUpdateBaseline && baselinePath) {
		saveBaseline(result.findings, baselinePath);
	}

	setOutput("score", String(result.score));
	setOutput("findings-count", String(result.findings.length));
	setOutput("passed", String(result.passed));

	const comment = formatPRComment(result.findings, {
		url: result.url,
		score: result.score,
		threshold: result.threshold,
		passed: result.passed,
		diff,
	});

	console.log(comment);

	if (shouldComment && githubToken) {
		try {
			await postPRComment(comment, githubToken);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`Warning: Failed to post PR comment: ${msg}`);
		}
	}

	if (!result.passed) {
		console.error(`\nSecurity check failed: findings at or above "${failOn}" severity detected`);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
