import type { Server } from "node:http";
import { expect, test } from "../../src/index.js";
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

test("secure page passes header checks", async ({ page }) => {
	const response = await page.goto(`${baseUrl}/secure`);
	await expect(response!).toHaveSecureHeaders();
});

test("insecure page fails header checks", async ({ page }) => {
	const response = await page.goto(`${baseUrl}/insecure`);
	await expect(response!).not.toHaveSecureHeaders();
});

test("partial page fails on missing headers", async ({ page }) => {
	const response = await page.goto(`${baseUrl}/partial`);
	await expect(response!).not.toHaveSecureHeaders();
});

test("skip option allows passing with missing headers", async ({ page }) => {
	const response = await page.goto(`${baseUrl}/partial`);
	await expect(response!).toHaveSecureHeaders({
		skip: [
			"content-security-policy",
			"x-frame-options",
			"referrer-policy",
			"permissions-policy",
			"cross-origin-opener-policy",
			"cross-origin-resource-policy",
			"cross-origin-embedder-policy",
		],
	});
});

test("security fixture headers.assert works on secure page", async ({ page, security }) => {
	await page.goto(`${baseUrl}/secure`);
	await security.headers.assert();
});

test("security fixture headers.assert throws on insecure page", async ({ page, security }) => {
	await page.goto(`${baseUrl}/insecure`);
	await expect(security.headers.assert()).rejects.toThrow("Security assertion failed");
});
