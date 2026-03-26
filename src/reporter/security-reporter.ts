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

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;

function colorize(text: string, color: string): string {
	return supportsColor ? `${color}${text}\x1b[0m` : text;
}

const SEVERITY_COLORS: Record<string, string> = {
	critical: "\x1b[31m",
	high: "\x1b[91m",
	medium: "\x1b[33m",
	low: "\x1b[36m",
	info: "\x1b[90m",
};
const RESET = supportsColor ? "\x1b[0m" : "";
const BOLD = supportsColor ? "\x1b[1m" : "";

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
				const bodyStr = attachment.body.toString();
				if (bodyStr.length > MAX_ATTACHMENT_SIZE) {
					console.warn(
						`[kovar] Security findings attachment too large (${bodyStr.length} bytes), skipping`,
					);
					continue;
				}
				const findings: unknown = JSON.parse(bodyStr);
				if (!Array.isArray(findings)) continue;
				if (findings.length > 0) {
					this.allFindings.push(...(findings as SecurityFinding[]));
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
			console.log(
				padLine(`  ${colorize(`✗ ${summary.critical} critical`, SEVERITY_COLORS.critical ?? "")}`),
			);
		}
		if (summary.high > 0) {
			console.log(padLine(`  ${colorize(`✗ ${summary.high} high`, SEVERITY_COLORS.high ?? "")}`));
		}
		if (summary.medium > 0) {
			console.log(
				padLine(`  ${colorize(`⚠ ${summary.medium} medium`, SEVERITY_COLORS.medium ?? "")}`),
			);
		}
		if (summary.low > 0) {
			console.log(padLine(`  ${colorize(`⚠ ${summary.low} low`, SEVERITY_COLORS.low ?? "")}`));
		}
		if (summary.info > 0) {
			console.log(padLine(`  ${colorize(`ℹ ${summary.info} info`, SEVERITY_COLORS.info ?? "")}`));
		}

		console.log(padLine(""));
		console.log(padLine(`  ${this.testsWithFindings} test(s) with security findings`));
		console.log(padLine(""));
		console.log(`${BOLD}└${border}┘${RESET}`);
		console.log("");
	}
}

export default SecurityReporter;
