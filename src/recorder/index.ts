import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "@playwright/test";
import type { SourceMetadata } from "../source/types.js";

async function lazyParseSourceLocation(
	filePath: string,
	line: number,
	col: number,
): Promise<SourceMetadata | null> {
	try {
		const { parseSourceLocation } = await import("../source/parser.js");
		return parseSourceLocation(filePath, line, col);
	} catch {
		return null;
	}
}
import { ActionCapture } from "./action-capture.js";
import {
	extractPOMCode,
	testNameFromUrl,
	validateCode,
	validateSpecCode,
	writeGeneratedFiles,
	writeTestFile,
} from "./codegen.js";
import { createLLMProvider } from "./llm/index.js";
import { buildPrompt } from "./llm/prompt.js";
import { NetworkCapture } from "./network-capture.js";
import { Toolbar } from "./toolbar.js";
import type { RecorderConfig, SessionData } from "./types.js";

export type { RecorderConfig, SessionData } from "./types.js";

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_DURATION = 30 * 60 * 1000; // 30 minutes

export class RecordingSession {
	private config: Required<
		Pick<
			RecorderConfig,
			"outputDir" | "captureNetwork" | "maskPasswords" | "maxActions" | "maxDuration"
		>
	> &
		RecorderConfig;

	constructor(config: RecorderConfig) {
		this.config = {
			captureNetwork: true,
			maskPasswords: true,
			maxActions: 200,
			maxDuration: DEFAULT_MAX_DURATION,
			...config,
			outputDir: config.outputDir || "./tests",
		};
	}

	async run(): Promise<string> {
		const { chromium } = await this.resolvePlaywright();
		const browser = await chromium.launch({
			headless: false,
			args: ["--disable-blink-features=AutomationControlled"],
		});

		const cleanup = async () => {
			await browser.close();
		};

		const sigintHandler = async () => {
			console.log("\n  ✦ Recording interrupted. Saving captured data...");
			await cleanup();
			process.exit(0);
		};

		process.on("SIGINT", sigintHandler);

		try {
			return await this.record(browser);
		} finally {
			process.removeListener("SIGINT", sigintHandler);
			await browser.close().catch(() => {});
		}
	}

	private async setupRecordingSession(browser: Browser): Promise<{
		sessionData: SessionData;
		sourceDir: string | undefined;
	}> {
		const context = await browser.newContext({
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		});
		const page = await context.newPage();

		await page.addInitScript(() => {
			Object.defineProperty(navigator, "webdriver", { get: () => false });
		});

		const actionCapture = new ActionCapture(this.config.maxActions);
		const networkCapture = new NetworkCapture();
		const toolbar = new Toolbar();

		await actionCapture.attach(page);
		if (this.config.captureNetwork) {
			await networkCapture.attach(page);
		}

		const stopPromise = new Promise<void>((resolve) => {
			page.exposeFunction("__kovar_stopRecording", () => resolve()).catch(() => {});
		});

		await toolbar.attach(page);
		await page.goto(this.config.url);

		const startTime = Date.now();
		const maxDuration = this.config.maxDuration;

		let stopResolve: (() => void) | undefined;
		const watchdogPromise = new Promise<void>((resolve) => {
			stopResolve = resolve;
		});

		const updateInterval = setInterval(async () => {
			try {
				await toolbar.updateCounts(
					page,
					actionCapture.getActionCount(),
					networkCapture.getRequestCount(),
				);
			} catch {
				// Page may have closed
			}

			const now = Date.now();
			const idleTime = now - actionCapture.getLastActivityTime();
			if (idleTime >= DEFAULT_IDLE_TIMEOUT) {
				console.warn("\n  ⚠ No actions captured for 5 minutes — auto-stopping recording.");
				stopResolve?.();
			}
			if (now - startTime >= maxDuration) {
				console.warn(
					`\n  ⚠ Maximum recording duration (${Math.round(maxDuration / 60000)} min) reached — auto-stopping.`,
				);
				stopResolve?.();
			}
		}, 500);

		console.log("\n  ✦ Recording started — browse your app normally");
		console.log("  ✦ Press the Stop button in the toolbar to finish\n");

		await Promise.race([stopPromise, watchdogPromise]);
		clearInterval(updateInterval);

		console.log(
			`  ✦ Captured ${actionCapture.getActionCount()} actions + ${networkCapture.getRequestCount()} API calls`,
		);

		const sessionData: SessionData = {
			startUrl: this.config.url,
			finalUrl: page.url(),
			pageTitle: await page.title(),
			actions: actionCapture.getActions(),
			requests: networkCapture.getRequests(),
			startTime,
			endTime: Date.now(),
		};

		await context.close();

		return { sessionData, sourceDir: this.config.sourceDir };
	}

	private async resolveSourceMetadata(
		sessionData: SessionData,
		sourceDir: string,
	): Promise<Map<number, SourceMetadata>> {
		const sourceMap = new Map<number, SourceMetadata>();
		let actionsWithKovarData = 0;
		for (let i = 0; i < sessionData.actions.length; i++) {
			const action = sessionData.actions[i];
			if (!action) continue;
			if (action.element?.kovarFile && action.element.kovarLine && action.element.kovarCol) {
				actionsWithKovarData++;
				const filePath = join(sourceDir, action.element.kovarFile);
				const meta = await lazyParseSourceLocation(
					filePath,
					Number.parseInt(action.element.kovarLine, 10),
					Number.parseInt(action.element.kovarCol, 10),
				);
				if (meta) {
					sourceMap.set(i, meta);
				}
			}
		}
		if (sourceMap.size === 0 && actionsWithKovarData > 0) {
			console.warn(`  ⚠ No source metadata resolved. Check --source path: ${sourceDir}`);
		} else if (sourceMap.size > 0) {
			console.log(
				`  ✦ Resolved source metadata for ${sourceMap.size}/${actionsWithKovarData} actions`,
			);
		}
		return sourceMap;
	}

	private async record(browser: Browser): Promise<string> {
		if (this.config.sourceDir && !existsSync(this.config.sourceDir)) {
			console.error(`  ✗ Source directory not found: ${this.config.sourceDir}`);
			console.error("  ✦ Recording will continue without source mapping.\n");
			this.config.sourceDir = undefined;
		}

		const { sessionData, sourceDir } = await this.setupRecordingSession(browser);

		let sourceMap: Map<number, SourceMetadata> | undefined;
		if (sourceDir) {
			sourceMap = await this.resolveSourceMetadata(sessionData, sourceDir);
		}

		return this.generateTest(sessionData, sourceMap);
	}

	private async generateTest(
		session: SessionData,
		sourceMap?: Map<number, SourceMetadata>,
	): Promise<string> {
		const testName = this.config.testName || testNameFromUrl(session.startUrl);

		console.log("  ✦ Generating Page Object Model test with AI...");

		try {
			const provider = createLLMProvider(this.config.provider, this.config.model);
			const { system, user } = buildPrompt(session, testName, sourceMap);

			const response = await provider.generate({
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
				this.config.outputDir,
				testName,
				pages,
				spec,
				session.startUrl,
			);

			if (files.pagePath) console.log(`  ✦ Page object: ${files.pagePath}`);
			console.log(`  ✦ Test spec:   ${files.specPath}`);
			if (files.envExamplePath) console.log(`  ✦ Env example: ${files.envExamplePath}`);
			console.log(`  ✦ Tokens used: ${response.tokensUsed}\n`);

			return files.specPath;
		} catch (error) {
			const fallbackPath = writeTestFile(
				this.config.outputDir,
				`${testName}.recording`,
				JSON.stringify(session, null, 2),
			);
			const message = error instanceof Error ? error.message : String(error);
			console.error(`  ✗ LLM generation failed: ${message}`);
			console.error(`  ✦ Raw recording saved: ${fallbackPath}`);
			console.error("  ✦ You can retry later or use the recording data manually.\n");
			return fallbackPath;
		}
	}

	private async resolvePlaywright(): Promise<{ chromium: typeof import("playwright").chromium }> {
		try {
			return await import("playwright");
		} catch {
			try {
				const pw = await import("@playwright/test");
				return { chromium: pw.chromium };
			} catch {
				throw new Error(
					"Playwright not found. Install it:\n  npm install -D @playwright/test\n  npx playwright install chromium",
				);
			}
		}
	}
}
