import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/integration",
	testMatch: "**/*.integration.test.ts",
	timeout: 30000,
	use: {
		headless: true,
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
