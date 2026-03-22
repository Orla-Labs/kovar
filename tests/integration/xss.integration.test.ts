import type { Server } from "node:http";
import { expect, test } from "../../dist/index.js";
import { startServer } from "./fixtures/test-server.js";

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
	const result = await startServer();
	server = result.server;
	baseUrl = result.url;
});

test.afterAll(async () => {
	server.close();
});

test("vulnerable page fails XSS check", async ({ page }) => {
	await page.goto(`${baseUrl}/xss-vulnerable`);
	await expect(page).not.toBeResilientToXSS({
		selector: "form",
		depth: "quick",
	});
});

test("safe page passes XSS check", async ({ page }) => {
	await page.goto(`${baseUrl}/xss-safe`);
	await expect(page).toBeResilientToXSS({
		selector: "form",
		depth: "quick",
	});
});
