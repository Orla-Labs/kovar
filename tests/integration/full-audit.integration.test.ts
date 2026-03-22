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

test("audit returns clean report for secure page", async ({ page, security }) => {
	await page.goto(`${baseUrl}/secure`);
	const report = await security.audit();

	expect(report.summary.critical).toBe(0);
	expect(report.summary.high).toBe(0);
	expect(report.url).toContain("/secure");
	expect(report.timestamp).toBeTruthy();
	expect(report.duration).toBeGreaterThanOrEqual(0);
});

test("audit returns findings for insecure page", async ({ page, security }) => {
	await page.goto(`${baseUrl}/insecure`);
	const report = await security.audit();

	expect(report.summary.critical).toBeGreaterThan(0);
	expect(report.findings.length).toBeGreaterThan(0);

	for (const finding of report.findings) {
		expect(finding.id).toBeTruthy();
		expect(finding.message).toBeTruthy();
		expect(finding.remediation).toBeTruthy();
		expect(finding.category).toMatch(/^(headers|cookies)$/);
	}
});

test("audit report has correct summary counts", async ({ page, security }) => {
	await page.goto(`${baseUrl}/insecure`);
	const report = await security.audit();

	const { summary, findings } = report;
	expect(summary.total).toBe(findings.length);
	expect(summary.critical + summary.high + summary.medium + summary.low + summary.info).toBe(
		summary.total,
	);
});
