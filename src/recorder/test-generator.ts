import type { SourceMetadata } from "../source/types.js";
import {
	extractPOMCode,
	sanitizeTestName,
	testNameFromUrl,
	validateCode,
	validateSpecCode,
	writeGeneratedFiles,
	writeTestFile,
} from "./codegen.js";
import { buildPrompt, sanitizeUrl } from "./llm/prompt.js";
import type { LLMProvider } from "./llm/types.js";
import type { RecordedAction, RecordedRequest, SessionData } from "./types.js";

const SENSITIVE_REQUEST_HEADERS =
	/^(authorization|cookie|set-cookie|x-api-key|x-auth-token|x-csrf-token|x-session-id|x-access-token|x-refresh-token|proxy-authorization)$/i;

function redactSessionData(session: SessionData): SessionData {
	const redactedRequests: RecordedRequest[] = session.requests.map((req) => {
		const redactedRequestHeaders: Record<string, string> = {};
		for (const [key, value] of Object.entries(req.requestHeaders)) {
			redactedRequestHeaders[key] = SENSITIVE_REQUEST_HEADERS.test(key) ? "[REDACTED]" : value;
		}
		return {
			...req,
			url: sanitizeUrl(req.url),
			requestPostData: req.requestPostData ? "[REDACTED]" : null,
			responseBody: null,
			requestHeaders: redactedRequestHeaders,
			responseHeaders: {},
		};
	});

	const redactedActions: RecordedAction[] = session.actions.map((action) => {
		const out: RecordedAction = { ...action };
		if (action.url) out.url = sanitizeUrl(action.url);
		if (action.delta?.newUrl)
			out.delta = { ...action.delta, newUrl: sanitizeUrl(action.delta.newUrl) };
		if (action.value !== undefined && action.value !== "[MASKED]") out.value = "[REDACTED]";
		return out;
	});

	return {
		...session,
		startUrl: sanitizeUrl(session.startUrl),
		finalUrl: sanitizeUrl(session.finalUrl),
		requests: redactedRequests,
		actions: redactedActions,
	};
}

export interface GenerateResult {
	specPath: string;
	pagePath: string | null;
	/** True when LLM generation failed and only the raw recording was saved. */
	fallback?: boolean;
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
		const resolvedName = testName ? sanitizeTestName(testName) : testNameFromUrl(session.startUrl);

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
			const redacted = redactSessionData(session);
			const fallbackPath = writeTestFile(
				this.outputDir,
				`${resolvedName}.recording`,
				JSON.stringify(redacted, null, 2),
			);
			const message = error instanceof Error ? error.message : String(error);
			console.error(`  ✗ LLM generation failed: ${message}`);
			console.error(`  ✦ Raw recording saved: ${fallbackPath}`);
			console.error("  ✦ You can retry later or use the recording data manually.\n");
			return { specPath: fallbackPath, pagePath: null, fallback: true };
		}
	}
}
