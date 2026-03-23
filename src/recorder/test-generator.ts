import type { SourceMetadata } from "../source/types.js";
import {
	extractPOMCode,
	testNameFromUrl,
	validateCode,
	validateSpecCode,
	writeGeneratedFiles,
	writeTestFile,
} from "./codegen.js";
import { buildPrompt } from "./llm/prompt.js";
import type { LLMProvider } from "./llm/types.js";
import type { SessionData } from "./types.js";

export interface GenerateResult {
	specPath: string;
	pagePath: string | null;
}

export class TestGenerator {
	constructor(
		private provider: LLMProvider,
		private outputDir: string,
	) {}

	async generate(
		session: SessionData,
		testName?: string,
		sourceMap?: Map<number, SourceMetadata>,
	): Promise<GenerateResult> {
		const resolvedName = testName || testNameFromUrl(session.startUrl);

		console.log("  ✦ Generating Page Object Model test with AI...");

		try {
			const { system, user } = buildPrompt(session, resolvedName, sourceMap);

			const response = await this.provider.generate({
				systemPrompt: system,
				userPrompt: user,
				maxTokens: 8192,
			});

			const { pages, spec } = extractPOMCode(response.testCode);

			if (pages && !validateCode(pages)) {
				throw new Error("Generated page object code failed validation");
			}
			if (!validateSpecCode(spec)) {
				throw new Error("Generated spec code failed validation — missing required patterns");
			}

			const files = writeGeneratedFiles(
				this.outputDir,
				resolvedName,
				pages,
				spec,
				session.startUrl,
			);

			if (files.pagePath) console.log(`  ✦ Page object: ${files.pagePath}`);
			console.log(`  ✦ Test spec:   ${files.specPath}`);
			if (files.envExamplePath) console.log(`  ✦ Env example: ${files.envExamplePath}`);
			console.log(`  ✦ Tokens used: ${response.tokensUsed}\n`);

			return { specPath: files.specPath, pagePath: files.pagePath };
		} catch (error) {
			const fallbackPath = writeTestFile(
				this.outputDir,
				`${resolvedName}.recording`,
				JSON.stringify(session, null, 2),
			);
			const message = error instanceof Error ? error.message : String(error);
			console.error(`  ✗ LLM generation failed: ${message}`);
			console.error(`  ✦ Raw recording saved: ${fallbackPath}`);
			console.error("  ✦ You can retry later or use the recording data manually.\n");
			return { specPath: fallbackPath, pagePath: null };
		}
	}
}
