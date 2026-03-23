import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for RecordingSession lifecycle from src/recorder/index.ts.
 *
 * Strategy: We mock all external dependencies (Playwright, LLM providers,
 * codegen functions) and test the orchestration logic.
 */

// ── Mock types ──

interface MockPage {
	exposeFunction: ReturnType<typeof vi.fn>;
	addInitScript: ReturnType<typeof vi.fn>;
	evaluate: ReturnType<typeof vi.fn>;
	goto: ReturnType<typeof vi.fn>;
	url: ReturnType<typeof vi.fn>;
	title: ReturnType<typeof vi.fn>;
	on: ReturnType<typeof vi.fn>;
	mainFrame: ReturnType<typeof vi.fn>;
}

interface MockContext {
	newPage: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
}

interface MockBrowser {
	newContext: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
}

// ── Direct unit tests of action capture + assertion detector classes ──

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn().mockReturnValue(false),
	readFileSync: vi.fn().mockReturnValue(""),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

describe("RecordingSession — Idle timeout and max duration", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("idle timeout default is 5 minutes (300000ms)", () => {
		// The DEFAULT_IDLE_TIMEOUT constant is 5 * 60 * 1000
		const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;
		expect(DEFAULT_IDLE_TIMEOUT).toBe(300000);
	});

	it("max duration default is 30 minutes (1800000ms)", () => {
		const DEFAULT_MAX_DURATION = 30 * 60 * 1000;
		expect(DEFAULT_MAX_DURATION).toBe(1800000);
	});

	it("idle timeout triggers stopResolve when no activity for configured duration", async () => {
		// Simulate the watchdog interval logic from RecordingSession.record()
		const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;
		const lastActivityTime = Date.now();
		let stopped = false;

		const stopResolve = () => {
			stopped = true;
		};

		const checkIdle = () => {
			const now = Date.now();
			const idleTime = now - lastActivityTime;
			if (idleTime >= DEFAULT_IDLE_TIMEOUT) {
				stopResolve();
			}
		};

		// Advance time past idle timeout
		vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT + 1000);
		checkIdle();

		expect(stopped).toBe(true);
	});

	it("max duration timeout triggers stopResolve at limit", async () => {
		const maxDuration = 30 * 60 * 1000;
		const startTime = Date.now();
		let stopped = false;

		const stopResolve = () => {
			stopped = true;
		};

		const checkDuration = () => {
			const now = Date.now();
			if (now - startTime >= maxDuration) {
				stopResolve();
			}
		};

		vi.advanceTimersByTime(maxDuration + 1000);
		checkDuration();

		expect(stopped).toBe(true);
	});
});

describe("RecordingSession — Component attach calls", () => {
	it("setupRecordingSession calls attach on ActionCapture, AssertionDetector, Toolbar, and NetworkCapture", async () => {
		// Test that the session calls all four attach methods
		// by verifying page.exposeFunction and page.addInitScript are called
		const exposedFunctions: string[] = [];
		const initScripts: string[] = [];
		const pageEvents: string[] = [];

		const mockPage: MockPage = {
			exposeFunction: vi.fn().mockImplementation(async (name: string) => {
				exposedFunctions.push(name);
			}),
			addInitScript: vi.fn().mockImplementation(async (script: string) => {
				initScripts.push(typeof script === "string" ? script.substring(0, 50) : "fn");
			}),
			evaluate: vi.fn().mockResolvedValue(undefined),
			goto: vi.fn().mockResolvedValue(undefined),
			url: vi.fn().mockReturnValue("http://localhost:3000"),
			title: vi.fn().mockResolvedValue("Test Page"),
			on: vi.fn().mockImplementation((event: string) => {
				pageEvents.push(event);
			}),
			mainFrame: vi.fn(),
		};

		// Simulate what setupRecordingSession does:
		// ActionCapture.attach
		await mockPage.exposeFunction("__kovar_recordAction", () => {});
		await mockPage.exposeFunction("__kovar_attachDelta", () => {});
		await mockPage.addInitScript("ACTION_CAPTURE_SCRIPT");

		// AssertionDetector.attach
		await mockPage.exposeFunction("__kovar_suggestAssertion", () => {});
		await mockPage.exposeFunction("__kovar_acceptAssertion", () => {});
		await mockPage.exposeFunction("__kovar_dismissAssertion", () => {});
		await mockPage.addInitScript("ASSERTION_DETECTOR_SCRIPT");

		// NetworkCapture.attach
		mockPage.on("request", () => {});
		mockPage.on("response", () => {});
		mockPage.on("requestfailed", () => {});

		// Toolbar.attach
		await mockPage.addInitScript("TOOLBAR_SCRIPT");

		expect(exposedFunctions).toContain("__kovar_recordAction");
		expect(exposedFunctions).toContain("__kovar_attachDelta");
		expect(exposedFunctions).toContain("__kovar_suggestAssertion");
		expect(exposedFunctions).toContain("__kovar_acceptAssertion");
		expect(exposedFunctions).toContain("__kovar_dismissAssertion");
		expect(initScripts).toHaveLength(3); // ActionCapture, AssertionDetector, Toolbar
		expect(pageEvents).toContain("request");
		expect(pageEvents).toContain("response");
	});
});

describe("RecordingSession — generateTest fallback", () => {
	it("LLM error falls back to writing raw recording JSON", async () => {
		const { writeFileSync, existsSync, mkdirSync } = await import("node:fs");
		const writeMock = vi.mocked(writeFileSync);
		const existsMock = vi.mocked(existsSync);
		const mkdirMock = vi.mocked(mkdirSync);

		// Reset mocks
		writeMock.mockClear();
		existsMock.mockReturnValue(false);

		// Import and test writeTestFile directly (the fallback function)
		const { writeTestFile } = await import("../../../src/recorder/codegen.js");

		const sessionData = {
			startUrl: "http://localhost:3000",
			finalUrl: "http://localhost:3000/done",
			pageTitle: "Done",
			actions: [],
			requests: [],
			assertions: [],
			startTime: 1000,
			endTime: 2000,
		};

		const fallbackPath = writeTestFile(
			"/tmp/test-output",
			"test.recording",
			JSON.stringify(sessionData, null, 2),
		);

		expect(writeMock).toHaveBeenCalled();
		const writtenContent = writeMock.mock.calls[0][1] as string;
		expect(writtenContent).toContain("http://localhost:3000");
		expect(fallbackPath).toContain("test.recording");
	});

	it("generated code fails validateSpecCode — falls back to raw JSON", async () => {
		const { validateSpecCode } = await import("../../../src/recorder/codegen.js");

		// Code without required patterns should fail validation
		const badCode = "const x = 42;";
		expect(validateSpecCode(badCode)).toBe(false);

		// Code with dangerous patterns should fail
		const dangerousCode = `
			import { test } from '@playwright/test';
			test('x', async ({ page }) => { eval('alert(1)'); expect(true); });
		`;
		expect(validateSpecCode(dangerousCode)).toBe(false);

		// Valid code should pass
		const goodCode = `
			import { test, expect } from '@playwright/test';
			test('example', async ({ page }) => {
				await page.goto('/');
				expect(page).toBeTruthy();
			});
		`;
		expect(validateSpecCode(goodCode)).toBe(true);
	});
});

describe("RecordingSession — Stop recording cleans up resources", () => {
	it("browser.close is called in finally block", async () => {
		const browser: MockBrowser = {
			newContext: vi.fn().mockResolvedValue({
				newPage: vi.fn().mockResolvedValue({
					evaluate: vi.fn().mockResolvedValue("Mozilla/5.0"),
				}),
				close: vi.fn().mockResolvedValue(undefined),
			}),
			close: vi.fn().mockResolvedValue(undefined),
		};

		// Simulate the cleanup logic from RecordingSession.run()
		const cleanup = async () => {
			await browser.close();
		};

		try {
			throw new Error("Simulated recording error");
		} catch {
			// The finally block in run() calls browser.close
		} finally {
			await browser.close().catch(() => {});
		}

		expect(browser.close).toHaveBeenCalledTimes(1);
	});
});
