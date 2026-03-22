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

test("secure page passes cookie checks", async ({ page, context }) => {
	await page.goto(`${baseUrl}/secure`);
	await expect(context).toHaveSecureCookies();
});

test("insecure page fails cookie checks", async ({ page, context }) => {
	await page.goto(`${baseUrl}/insecure`);
	await expect(context).not.toHaveSecureCookies();
});

test("security fixture cookies.assert works on secure page", async ({ page, security }) => {
	await page.goto(`${baseUrl}/secure`);
	await security.cookies.assert();
});

test("security fixture cookies.assert throws on insecure page", async ({ page, security }) => {
	await page.goto(`${baseUrl}/insecure`);
	await expect(security.cookies.assert()).rejects.toThrow("Security assertion failed");
});
