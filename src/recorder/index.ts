import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "@playwright/test";
import type { SourceMetadata } from "../source/types.js";
import { ActionCapture } from "./action-capture.js";
import { AssertionDetector } from "./assertion-detector.js";
import { createLLMProvider } from "./llm/index.js";
import { NetworkCapture } from "./network-capture.js";
import { SelfHealer } from "./self-healer.js";
import { TestGenerator } from "./test-generator.js";
import { Toolbar } from "./toolbar.js";
import type { RecorderConfig, SessionData } from "./types.js";

async function lazyParseSourceLocation(
	filePath: string,
	line: number,
	col: number,
): Promise<SourceMetadata | null> {
	try {
		const { parseSourceLocation } = await import("../source/parser.js");
		return parseSourceLocation(filePath, line, col);
	} catch (error) {
		console.warn(
			`[kovar] Failed to parse source location at ${filePath}:${line}:${col}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

export type { RecorderConfig, SessionData } from "./types.js";
export { TestGenerator } from "./test-generator.js";
/** @internal Not part of the stable public API. */
export { SelfHealer } from "./self-healer.js";

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_DURATION = 30 * 60 * 1000; // 30 minutes

export class RecordingSession {
	private config: Required<
		Pick<
			RecorderConfig,
			| "outputDir"
			| "captureNetwork"
			| "maskPasswords"
			| "maxActions"
			| "maxDuration"
			| "heal"
			| "healAttempts"
		>
	> &
		RecorderConfig;

	constructor(config: RecorderConfig) {
		this.config = {
			captureNetwork: true,
			maskPasswords: true,
			maxActions: 200,
			maxDuration: DEFAULT_MAX_DURATION,
			heal: false,
			healAttempts: 3,
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

		const sigintHandler = async () => {
			console.log("\n  ✦ Recording interrupted. Saving captured data...");
			await browser.close();
			process.exit(0);
		};

		process.on("SIGINT", sigintHandler);

		try {
			return await this.record(browser);
		} finally {
			process.removeListener("SIGINT", sigintHandler);
			await browser.close().catch((error) => {
				console.warn(
					`[kovar] Failed to close browser: ${error instanceof Error ? error.message : String(error)}`,
				);
			});
		}
	}

	private async setupRecordingSession(browser: Browser): Promise<{
		sessionData: SessionData;
		sourceDir: string | undefined;
	}> {
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		const rawUA = await tempPage.evaluate(() => navigator.userAgent);
		await tempContext.close();
		const cleanUA = rawUA.replace(/HeadlessChrome/g, "Chrome");

		const context = await browser.newContext({
			userAgent: cleanUA,
		});
		const page = await context.newPage();

		await page.addInitScript(() => {
			Object.defineProperty(navigator, "webdriver", { get: () => false });
		});

		const actionCapture = new ActionCapture(this.config.maxActions);
		const networkCapture = new NetworkCapture();
		const assertionDetector = new AssertionDetector();
		const toolbar = new Toolbar();

		await actionCapture.attach(page);
		await assertionDetector.attach(page);
		if (this.config.captureNetwork) {
			await networkCapture.attach(page);
		}

		// Bridge: show assertion suggestions in toolbar
		assertionDetector.setOnSuggestion(async (suggestion) => {
			try {
				await toolbar.showSuggestion(page, suggestion);
			} catch (error) {
				console.warn(
					`[kovar] Failed to show assertion suggestion: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		});

		// Bridge: push network-based assertion suggestions
		if (this.config.captureNetwork) {
			networkCapture.setOnResponse((request) => {
				assertionDetector.suggestFromNetwork(request);
			});
		}

		const stopPromise = new Promise<void>((resolve) => {
			page
				.exposeFunction("__kovar_stopRecording", () => resolve())
				.catch((error) => {
					console.warn(
						`[kovar] Failed to expose stop function: ${error instanceof Error ? error.message : String(error)}`,
					);
				});
		});

		await toolbar.attach(page);
		await page.goto(this.config.url);

		const startTime = Date.now();
		const maxDuration = this.config.maxDuration ?? DEFAULT_MAX_DURATION;

		let stopResolve: (() => void) | undefined;
		const watchdogPromise = new Promise<void>((resolve) => {
			stopResolve = resolve;
		});

		const updateInterval = setInterval(async () => {
			try {
				assertionDetector.setActionCount(actionCapture.getActionCount());
				await assertionDetector.syncActionCount(page);
				await toolbar.updateCounts(
					page,
					actionCapture.getActionCount(),
					networkCapture.getRequestCount(),
					assertionDetector.getAcceptedCount(),
				);
			} catch (error) {
				console.warn(
					`[kovar] Failed to update recording toolbar: ${error instanceof Error ? error.message : String(error)}`,
				);
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
		console.log("  ✦ Accept or dismiss assertion suggestions in the toolbar");
		console.log("  ✦ Press the Stop button in the toolbar to finish\n");

		await Promise.race([stopPromise, watchdogPromise]);
		clearInterval(updateInterval);

		const acceptedCount = assertionDetector.getAcceptedCount();
		console.log(
			`  ✦ Captured ${actionCapture.getActionCount()} actions + ${networkCapture.getRequestCount()} API calls + ${acceptedCount} assertions`,
		);

		const sessionData: SessionData = {
			startUrl: this.config.url,
			finalUrl: page.url(),
			pageTitle: await page.title(),
			actions: actionCapture.getActions(),
			requests: networkCapture.getRequests(),
			assertions: assertionDetector.getAcceptedAssertions(),
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

		const provider = createLLMProvider(this.config.provider, this.config.model);
		const generator = new TestGenerator(provider, this.config.outputDir);
		const result = await generator.generate(sessionData, this.config.testName, sourceMap);

		if (this.config.heal) {
			const healer = new SelfHealer(provider, this.config.outputDir, this.config.healAttempts);
			await healer.heal(result.specPath, result.pagePath);
		}

		return result.specPath;
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
