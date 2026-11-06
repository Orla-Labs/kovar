import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/accuracy",
	testMatch: "**/*.accuracy.test.ts",
	timeout: 120000,
	fullyParallel: false,
	workers: 1,
	reporter: [["list"]],
	use: { headless: true, browserName: "chromium" },
});
