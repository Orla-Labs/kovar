import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import {
	XSSScanner,
	analyzeCookies,
	analyzeHeaders,
	checkAuth,
	checkCORS,
	checkCSRF,
	mapPlaywrightCookies,
} from "../../src/core.js";
import { SecurityFixture } from "../../src/fixtures/security-fixture.js";
import type { SecurityFinding } from "../../src/types/index.js";
import { filterFailures } from "../../src/utils/matcher-helpers.js";
import { type FixtureApp, startFixtureApp } from "./fixture-app.js";

/**
 * Detection-accuracy suite. Each test encodes the CORRECT verdict:
 *   /vuln/* routes must produce at least one critical/high finding (matcher fails),
 *   /good/* routes must produce none (matcher passes).
 * Cases that are known-wrong and not yet fixed are wrapped in test.fail() with the
 * finding ID from kovar-review/r1-detection.md, so the suite stays green and the
 * gap stays visible.
 */

let app: FixtureApp;

test.beforeAll(async () => {
	app = await startFixtureApp();
});

test.afterAll(async () => {
	app.server.close();
});

test.beforeEach(() => app.reset());

function failing(findings: SecurityFinding[]): string[] {
	return filterFailures(findings).map((f) => `${f.id}${f.header ? `:${f.header}` : ""}`);
}

async function login(page: Page): Promise<APIRequestContext> {
	await page.goto(`${app.url}/do-login`);
	return page.context().request;
}

// ------------------------------------------------------------------------ headers

async function headerVerdicts(page: Page, request: APIRequestContext, path: string) {
	const nav = await page.goto(`${app.url}${path}`);
	if (!nav) throw new Error("no navigation response");
	const viaMatcher = failing(analyzeHeaders(await nav.allHeaders()));
	const viaFixture = failing(analyzeHeaders((await request.get(`${app.url}${path}`)).headers()));
	return { viaMatcher, viaFixture };
}

test.describe("headers", () => {
	test("control: good headers pass", async ({ page, request }) => {
		const v = await headerVerdicts(page, request, "/good/headers");
		expect(v.viaMatcher).toEqual([]);
		expect(v.viaFixture).toEqual([]);
	});

	for (const path of [
		"/vuln/csp-default-unsafe-inline",
		"/vuln/csp-no-script-restriction",
		"/vuln/csp-scheme-sources",
		"/vuln/csp-uppercase-unsafe-eval",
		"/vuln/csp-report-only",
	]) {
		test(`FN check: ${path} flags CSP`, async ({ page, request }) => {
			const v = await headerVerdicts(page, request, path);
			expect(v.viaMatcher).toContain("header-missing-csp:content-security-policy");
			expect(v.viaFixture).toContain("header-missing-csp:content-security-policy");
		});
	}

	for (const path of [
		"/good/csp-strict-dynamic",
		"/good/duplicate-headers",
		"/good/hsts-quoted",
		"/good/frame-ancestors-only",
	]) {
		test(`FP check: ${path} passes`, async ({ page, request }) => {
			const v = await headerVerdicts(page, request, path);
			expect(v.viaMatcher).toEqual([]);
			expect(v.viaFixture).toEqual([]);
		});
	}
});

// ------------------------------------------------------------------------ cookies

async function cookieVerdict(page: Page, path: string) {
	await page.goto(`${app.url}${path}`);
	return analyzeCookies(mapPlaywrightCookies(await page.context().cookies()));
}

test.describe("cookies", () => {
	for (const [path, name] of [
		["/vuln/cookie-sessionid", "sessionid"],
		["/vuln/cookie-rails", "_myapp_session"],
		["/vuln/cookie-laravel", "laravel_session"],
		["/vuln/cookie-auth0", "appSession"],
	] as const) {
		test(`FN check: ${name} without HttpOnly/Secure is flagged`, async ({ page }) => {
			const findings = await cookieVerdict(page, path);
			const ids = filterFailures(findings)
				.filter((f) => f.cookie === name)
				.map((f) => f.id);
			expect(ids).toContain("cookie-missing-httponly");
		});
	}

	for (const path of ["/good/cookie-xsrf-token", "/good/cookie-django-csrftoken"]) {
		test(`FP check: ${path} passes (CSRF cookie must be JS-readable)`, async ({ page }) => {
			expect(failing(await cookieVerdict(page, path))).toEqual([]);
		});
	}
});

// ------------------------------------------------------------------------ XSS

async function xssVerdicts(page: Page, request: APIRequestContext, path: string, apiFirst = true) {
	await page.goto(`${app.url}${path}`);
	const matcherScan = await new XSSScanner(page, page.context().request).scan({ apiFirst });
	await page.goto(`${app.url}${path}`);
	const fixture = new SecurityFixture(page, page.context(), request);
	const fixtureFindings = await fixture.xss.check({ apiFirst });
	return {
		matcherFails: matcherScan.findings.length > 0,
		matcherIds: matcherScan.findings.map((f) => f.id),
		fixtureFails: filterFailures(fixtureFindings).length > 0,
	};
}

test.describe("xss (default apiFirst mode)", () => {
	test("control: raw reflection is flagged", async ({ page, request }) => {
		const v = await xssVerdicts(page, request, "/vuln/xss-reflect");
		expect(v.matcherFails).toBe(true);
		expect(v.fixtureFails).toBe(true);
	});

	test("control: fully escaped reflection passes", async ({ page, request }) => {
		const v = await xssVerdicts(page, request, "/good/xss-escaped");
		expect(v.matcherIds).toEqual([]);
		expect(v.fixtureFails).toBe(false);
	});

	test("FP check: text-node-escaped reflection passes", async ({ page, request }) => {
		const v = await xssVerdicts(page, request, "/good/xss-text-escaped");
		expect(v.matcherIds).toEqual([]);
	});

	for (const path of [
		"/vuln/xss-csrf-protected-form",
		"/vuln/xss-validation-error",
		"/vuln/xss-stored-json",
		"/vuln/xss-alert-filtered",
		"/vuln/xss-reflect-csp-blocked",
		"/vuln/xss-spa-fetch",
	]) {
		test(`FN check: ${path} is flagged`, async ({ page, request }) => {
			const v = await xssVerdicts(page, request, path);
			expect(v.matcherFails).toBe(true);
			expect(v.fixtureFails).toBe(true);
		});
	}

	test("silent-skip check: page with no <form> must not pass via fixture", async ({
		page,
		request,
	}) => {
		const v = await xssVerdicts(page, request, "/vuln/xss-no-form-input");
		expect(v.matcherFails).toBe(true);
		expect(v.fixtureFails).toBe(true);
	});
});

test.describe("xss: fixture vs matcher, and could-not-run", () => {
	test("FN check: logged-in page is scanned with the page's session by the fixture too", async ({
		page,
		request,
	}) => {
		await login(page);
		const v = await xssVerdicts(page, request, "/vuln/xss-authenticated");
		expect(v.matcherFails).toBe(true);
		expect(v.fixtureFails).toBe(true);
	});

	test("silent-skip check: form whose target is unreachable must not pass", async ({
		page,
		request,
	}) => {
		const v = await xssVerdicts(page, request, "/vuln/xss-dead-form-action");
		expect(v.matcherIds).toContain("xss-check-error");
		expect(v.fixtureFails).toBe(true);
	});
});

test.describe("xss (DOM mode, apiFirst:false)", () => {
	test("control: raw reflection triggers dialog", async ({ page, request }) => {
		const v = await xssVerdicts(page, request, "/vuln/xss-reflect", false);
		expect(v.matcherFails).toBe(true);
	});

	for (const path of [
		"/vuln/xss-spa-fetch-typed-button",
		"/vuln/xss-spa-fetch",
		"/vuln/xss-alert-filtered",
	]) {
		test(`FN check: ${path} is flagged in DOM mode`, async ({ page, request }) => {
			const v = await xssVerdicts(page, request, path, false);
			expect(v.matcherFails).toBe(true);
		});
	}
});

// ------------------------------------------------------------------------ auth

test.describe("auth", () => {
	test("control: open endpoint is flagged", async ({ request }) => {
		expect(failing(await checkAuth(request, `${app.url}/vuln/auth-open`))).not.toEqual([]);
	});

	test("control: 401 endpoint passes", async ({ request }) => {
		expect(failing(await checkAuth(request, `${app.url}/good/auth-401`))).toEqual([]);
	});

	test("FP check: 302-to-login endpoint passes", async ({ request }) => {
		expect(failing(await checkAuth(request, `${app.url}/good/auth-redirect`))).toEqual([]);
	});

	test("silent-skip check: unreachable server must not pass", async ({ request }) => {
		expect(failing(await checkAuth(request, "http://localhost:1/nothing"))).not.toEqual([]);
	});
});

// ------------------------------------------------------------------------ CSRF

test.describe("csrf (logged-in context, as a CSRF victim would be)", () => {
	test("FN check: cookie-session form endpoint without token is flagged", async ({ page }) => {
		const req = await login(page);
		expect(failing(await checkCSRF(req, `${app.url}/vuln/csrf-form-no-token`))).not.toEqual([]);
	});

	test("silent-skip check: anonymous request context is reported as 'could not evaluate'", async ({
		request,
	}) => {
		const ids = failing(await checkCSRF(request, `${app.url}/vuln/csrf-form-no-token`));
		expect(ids).toContain("csrf-check-unauthenticated");
	});

	test("control: token-protected endpoint passes", async ({ page }) => {
		const req = await login(page);
		expect(failing(await checkCSRF(req, `${app.url}/good/csrf-token`))).toEqual([]);
	});

	test("FP check: Origin/Sec-Fetch-Site protected endpoint passes", async ({ page }) => {
		const req = await login(page);
		expect(failing(await checkCSRF(req, `${app.url}/good/csrf-origin-check`))).toEqual([]);
	});

	test("FP check: JSON-only endpoint (not reachable by cross-site forms) passes", async ({
		page,
	}) => {
		const req = await login(page);
		expect(failing(await checkCSRF(req, `${app.url}/good/csrf-json-only`))).toEqual([]);
	});

	test("FP check: 302-to-login is not reported as an unprotected endpoint", async ({ request }) => {
		const ids = failing(await checkCSRF(request, `${app.url}/good/csrf-token-redirect-login`));
		expect(ids).not.toContain("csrf-unprotected-endpoint");
		expect(ids).toContain("csrf-check-unauthenticated");
	});

	test("control: same endpoint passes with a logged-in context", async ({ page }) => {
		const req = await login(page);
		expect(failing(await checkCSRF(req, `${app.url}/good/csrf-token-redirect-login`))).toEqual([]);
	});

	test("silent-skip check: unreachable server must not pass", async ({ request }) => {
		expect(failing(await checkCSRF(request, "http://localhost:1/nothing"))).not.toEqual([]);
	});
});

// ------------------------------------------------------------------------ CORS

test.describe("cors", () => {
	test("control: reflect-any with credentials is flagged", async ({ request }) => {
		expect(failing(await checkCORS(request, `${app.url}/vuln/cors-reflect-any`))).not.toEqual([]);
	});

	test("control: strict allowlist passes", async ({ request }) => {
		expect(failing(await checkCORS(request, `${app.url}/good/cors-allowlist`))).toEqual([]);
	});

	test("FN check: substring/suffix allowlist bypass is flagged", async ({ request }) => {
		expect(failing(await checkCORS(request, `${app.url}/vuln/cors-substring-match`))).not.toEqual(
			[],
		);
	});

	test("FN check: reflection on actual GET only (no preflight handler) is flagged", async ({
		request,
	}) => {
		expect(failing(await checkCORS(request, `${app.url}/vuln/cors-get-only`))).not.toEqual([]);
	});

	test("silent-skip check: unreachable server must not pass", async ({ request }) => {
		expect(failing(await checkCORS(request, "http://localhost:1/nothing"))).not.toEqual([]);
	});
});

// ------------------------------------------------------------------------ fixture could-not-run

test.describe("fixture: checks that could not run must not pass", () => {
	test("headers.check() before any navigation", async ({ page, context, request }) => {
		const fixture = new SecurityFixture(page, context, request);
		expect(failing(await fixture.headers.check())).toEqual(["headers-check-skipped"]);
	});

	test("audit() on a closed page", async ({ browser, request }) => {
		const ctx = await browser.newContext();
		const p = await ctx.newPage();
		const fixture = new SecurityFixture(p, ctx, request);
		await p.close();
		const report = await fixture.audit();
		expect(report.summary.high).toBe(1);
		await ctx.close();
	});
});
