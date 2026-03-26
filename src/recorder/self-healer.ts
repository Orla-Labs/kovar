import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractPOMCode, validateCode, validateSpecCode } from "./codegen.js";
import { buildFixPrompt } from "./llm/prompt.js";
import type { LLMProvider } from "./llm/types.js";

/** @internal Not part of the stable public API. May change without notice. */
export class SelfHealer {
	constructor(
		private provider: LLMProvider,
		private outputDir: string,
		private maxAttempts = 3,
	) {}

	async heal(specPath: string, pagePath: string | null): Promise<void> {
		for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
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
		if (!resolvedSpec.startsWith(resolvedOutput)) {
			throw new Error(
				`Test path "${resolvedSpec}" is outside output directory "${resolvedOutput}"`,
			);
		}

		try {
			execFileSync("npx", ["playwright", "test", specPath, "--reporter=line"], {
				timeout: 60000,
				stdio: "pipe",
				encoding: "utf-8",
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
