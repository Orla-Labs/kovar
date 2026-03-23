import type {
	FullConfig,
	FullResult,
	Reporter,
	Suite,
	TestCase,
	TestResult,
} from "@playwright/test/reporter";
import type { SecurityFinding } from "../types/index.js";
import { summarize } from "../types/results.js";

const SEVERITY_COLORS: Record<string, string> = {
	critical: "\x1b[31m",
	high: "\x1b[91m",
	medium: "\x1b[33m",
	low: "\x1b[36m",
	info: "\x1b[90m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

class SecurityReporter implements Reporter {
	private allFindings: SecurityFinding[] = [];
	private testsWithFindings = 0;

	onBegin(_config: FullConfig, _suite: Suite): void {}

	onTestEnd(_test: TestCase, result: TestResult): void {
		for (const attachment of result.attachments) {
			if (
				attachment.name === "kovar-findings" &&
				attachment.contentType === "application/json" &&
				attachment.body
			) {
				const findings: SecurityFinding[] = JSON.parse(attachment.body.toString());
				if (findings.length > 0) {
					this.allFindings.push(...findings);
					this.testsWithFindings++;
				}
			}
		}
	}

	onEnd(_result: FullResult): void {
		if (this.allFindings.length === 0) return;

		const summary = summarize(this.allFindings);
		const score = Math.max(
			0,
			100 - summary.critical * 20 - summary.high * 10 - summary.medium * 5 - summary.low * 2,
		);

		const BOX_WIDTH = 51;

		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping requires control chars
		const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
		function padLine(content: string): string {
			const visible = content.replace(ANSI_PATTERN, "");
			const pad = Math.max(0, BOX_WIDTH - 2 - visible.length);
			return `${BOLD}│${RESET}${content}${" ".repeat(pad)}${BOLD}│${RESET}`;
		}

		const border = "─".repeat(BOX_WIDTH - 2);

		console.log("");
		console.log(`${BOLD}┌─ Kovar Security Summary ${border.slice(24)}┐${RESET}`);
		console.log(padLine(""));
		console.log(padLine(`  Score: ${score}/100`));
		console.log(padLine(""));

		if (summary.critical > 0) {
			console.log(padLine(`  ${SEVERITY_COLORS.critical}✗ ${summary.critical} critical${RESET}`));
		}
		if (summary.high > 0) {
			console.log(padLine(`  ${SEVERITY_COLORS.high}✗ ${summary.high} high${RESET}`));
		}
		if (summary.medium > 0) {
			console.log(padLine(`  ${SEVERITY_COLORS.medium}⚠ ${summary.medium} medium${RESET}`));
		}
		if (summary.low > 0) {
			console.log(padLine(`  ${SEVERITY_COLORS.low}⚠ ${summary.low} low${RESET}`));
		}
		if (summary.info > 0) {
			console.log(padLine(`  ${SEVERITY_COLORS.info}ℹ ${summary.info} info${RESET}`));
		}

		console.log(padLine(""));
		console.log(padLine(`  ${this.testsWithFindings} test(s) with security findings`));
		console.log(padLine(""));
		console.log(`${BOLD}└${border}┘${RESET}`);
		console.log("");
	}
}

export default SecurityReporter;
