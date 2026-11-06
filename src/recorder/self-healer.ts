import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { extractPOMCode, validateCode, validateSpecCode } from "./codegen.js";
import { buildFixPrompt } from "./llm/prompt.js";
import type { LLMProvider } from "./llm/types.js";

/**
 * Environment passed to the generated test. The test is LLM-written code shaped
 * by untrusted page content, so it must not inherit CI secrets, LLM API keys or
 * loader hooks such as NODE_OPTIONS. Only what Playwright needs to start plus the
 * BASE_URL / TEST_* variables generated tests are allowed to read. Projects whose
 * playwright.config (e.g. `webServer`) needs more can opt variables in by name with
 * KOVAR_HEAL_ENV=VAR1,VAR2 (read from the real environment; .env cannot set it).
 */
const HEAL_ENV_KEYS = new Set([
	"PATH",
	"Path",
	"PATHEXT",
	"HOME",
	"USERPROFILE",
	"HOMEDRIVE",
	"HOMEPATH",
	"SystemRoot",
	"SYSTEMROOT",
	"ComSpec",
	"WINDIR",
	"TEMP",
	"TMP",
	"TMPDIR",
	"APPDATA",
	"LOCALAPPDATA",
	"XDG_CACHE_HOME",
	"XDG_RUNTIME_DIR",
	"DISPLAY",
	"WAYLAND_DISPLAY",
	"XAUTHORITY",
	"LANG",
	"LC_ALL",
	"TERM",
	"CI",
	"PLAYWRIGHT_BROWSERS_PATH",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"no_proxy",
	"NODE_EXTRA_CA_CERTS",
	"BASE_URL",
]);

export function buildHealEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	const optIn = new Set(
		(source.KOVAR_HEAL_ENV ?? "")
			.split(",")
			.map((k) => k.trim())
			.filter((k) => k && k !== "NODE_OPTIONS"),
	);
	for (const [key, value] of Object.entries(source)) {
		if (value === undefined) continue;
		if (HEAL_ENV_KEYS.has(key) || optIn.has(key) || /^TEST_[A-Z0-9_]+$/.test(key)) env[key] = value;
	}
	return env;
}

/**
 * Asked before EVERY execution of the generated test: attempt 1 runs the first
 * generation, and attempts 2..N run new LLM output. Resolve true to run it.
 */
export type HealConfirm = (specPath: string, attempt: number) => Promise<boolean>;

/** `--heal --yes`: run without asking. */
export const healConfirmYes: HealConfirm = async () => true;

/**
 * Default confirmation: prompt on an interactive terminal, refuse otherwise.
 * Non-interactive runs (CI, pipes) must opt in explicitly with `--yes`.
 */
export const healConfirmInteractive: HealConfirm = async (specPath, attempt) => {
	if (!process.stdin.isTTY) {
		console.warn(
			"  ⚠ Self-heal: not running the generated test. stdin is not a terminal, so it cannot be confirmed.\n" +
				"    Re-run with --heal --yes to execute AI-generated code without a prompt.",
		);
		return false;
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await rl.question(
			`  ? Self-heal attempt ${attempt}: run the AI-generated test ${specPath} on this machine? Review it first. [y/N] `,
		);
		return /^y(es)?$/i.test(answer.trim());
	} finally {
		rl.close();
	}
};

/** @internal Not part of the stable public API. May change without notice. */
export class SelfHealer {
	constructor(
		private provider: LLMProvider,
		private outputDir: string,
		private maxAttempts = 3,
		private confirm: HealConfirm = healConfirmInteractive,
	) {}

	async heal(specPath: string, pagePath: string | null): Promise<void> {
		console.warn(
			"  ⚠ --heal executes AI-generated test code on this machine. It only receives PATH/HOME-style variables,\n" +
				"    proxy settings, BASE_URL and TEST_* (plus any names listed in KOVAR_HEAL_ENV). Review the generated\n" +
				"    files first if the recorded site is not fully trusted.",
		);
		for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
			if (!(await this.confirm(specPath, attempt))) {
				console.log("  ✦ Self-heal: skipped; the generated test was not executed.\n");
				return;
			}
			console.log(`  ✦ Self-heal: running test (attempt ${attempt}/${this.maxAttempts})...`);

			const result = this.runTest(specPath);
			if (result.passed) {
				console.log("  ✦ Self-heal: test passed!\n");
				return;
			}

			if (attempt === this.maxAttempts) {
				console.warn(`  ⚠ Self-heal: test still failing after ${this.maxAttempts} attempts.`);
				console.warn(`  ⚠ Error: ${result.error.slice(0, 200)}\n`);
				return;
			}

			console.log("  ⚠ Self-heal: test failed, asking AI to fix...");

			const specCode = readFileSync(specPath, "utf-8");
			const pageCode = pagePath && existsSync(pagePath) ? readFileSync(pagePath, "utf-8") : null;

			const { system, user } = buildFixPrompt(specCode, pageCode, result.error);
			const response = await this.provider.generate({
				systemPrompt: system,
				userPrompt: user,
				maxTokens: 8192,
			});

			const { pages, spec } = extractPOMCode(response.testCode);

			if (spec && validateSpecCode(spec)) {
				writeFileSync(specPath, `${spec}\n`, "utf-8");
				if (pages && pagePath && validateCode(pages)) {
					writeFileSync(pagePath, `${pages}\n`, "utf-8");
				}
				console.log(`  ✦ Self-heal: code updated (tokens: ${response.tokensUsed})`);
			} else {
				console.warn("  ⚠ Self-heal: LLM fix failed validation, stopping.");
				return;
			}
		}
	}

	runTest(specPath: string): { passed: boolean; error: string } {
		const resolvedSpec = resolve(specPath);
		const resolvedOutput = resolve(this.outputDir);
		const rel = relative(resolvedOutput, resolvedSpec);
		if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
			throw new Error(
				`Test path "${resolvedSpec}" is outside output directory "${resolvedOutput}"`,
			);
		}

		try {
			// `--no`: never let npx download a package from the registry here.
			execFileSync("npx", ["--no", "playwright", "test", resolvedSpec, "--reporter=line"], {
				timeout: 60000,
				stdio: "pipe",
				encoding: "utf-8",
				env: buildHealEnv(),
				// Windows requires shell to resolve npx; safe here since specPath is validated above
				shell: process.platform === "win32",
			});
			return { passed: true, error: "" };
		} catch (err) {
			const error =
				err instanceof Error ? (err as { stderr?: string }).stderr || err.message : String(err);
			return { passed: false, error: error.slice(0, 2000) };
		}
	}
}
