import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	detectFramework,
	getCookieConfigFn,
	getFrameworkHelpers,
} from "../../../src/remediation/frameworks.js";
import type { Framework } from "../../../src/remediation/types.js";

describe("detectFramework", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kovar-fw-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function writePackageJson(deps: Record<string, string>, dev?: Record<string, string>): string {
		const pkgPath = join(tempDir, "package.json");
		const pkg: Record<string, unknown> = { name: "test" };
		if (Object.keys(deps).length > 0) pkg.dependencies = deps;
		if (dev && Object.keys(dev).length > 0) pkg.devDependencies = dev;
		writeFileSync(pkgPath, JSON.stringify(pkg));
		return pkgPath;
	}

	it("detects express", () => {
		const path = writePackageJson({ express: "^4.18.0" });
		expect(detectFramework(path)).toBe("express");
	});

	it("detects fastify", () => {
		const path = writePackageJson({ fastify: "^4.0.0" });
		expect(detectFramework(path)).toBe("fastify");
	});

	it("detects next", () => {
		const path = writePackageJson({ next: "^14.0.0" });
		expect(detectFramework(path)).toBe("next");
	});

	it("detects koa", () => {
		const path = writePackageJson({ koa: "^2.15.0" });
		expect(detectFramework(path)).toBe("koa");
	});

	it("detects hono", () => {
		const path = writePackageJson({ hono: "^4.0.0" });
		expect(detectFramework(path)).toBe("hono");
	});

	it("returns generic when no framework is found", () => {
		const path = writePackageJson({ lodash: "^4.0.0" });
		expect(detectFramework(path)).toBe("generic");
	});

	it("returns generic when no path is provided", () => {
		expect(detectFramework()).toBe("generic");
	});

	it("returns generic when file does not exist", () => {
		expect(detectFramework("/nonexistent/package.json")).toBe("generic");
	});

	it("prioritizes next over express when both present", () => {
		const path = writePackageJson({ next: "^14.0.0", express: "^4.18.0" });
		expect(detectFramework(path)).toBe("next");
	});

	it("detects framework from devDependencies", () => {
		const path = writePackageJson({}, { fastify: "^4.0.0" });
		expect(detectFramework(path)).toBe("fastify");
	});

	it("returns generic for invalid JSON", () => {
		const pkgPath = join(tempDir, "package.json");
		writeFileSync(pkgPath, "not json");
		expect(detectFramework(pkgPath)).toBe("generic");
	});
});

describe("getFrameworkHelpers", () => {
	const FRAMEWORKS: Framework[] = ["express", "fastify", "next", "koa", "hono", "generic"];

	it("returns helpers with setHeader, removeHeader, and filePath for every framework", () => {
		for (const framework of FRAMEWORKS) {
			const helpers = getFrameworkHelpers(framework);
			expect(typeof helpers.setHeader).toBe("function");
			expect(typeof helpers.removeHeader).toBe("function");
			expect(helpers.filePath).toBeTruthy();
		}
	});

	it("express setHeader produces middleware with res.set()", () => {
		const helpers = getFrameworkHelpers("express");
		const code = helpers.setHeader({ header: "X-Test", value: "test-value" });
		expect(code).toContain('res.set("X-Test", "test-value")');
		expect(code).toContain("next()");
	});

	it("express removeHeader produces middleware with res.removeHeader()", () => {
		const helpers = getFrameworkHelpers("express");
		const code = helpers.removeHeader("X-Test");
		expect(code).toContain('res.removeHeader("X-Test")');
	});

	it("fastify setHeader produces onSend hook with reply.header()", () => {
		const helpers = getFrameworkHelpers("fastify");
		const code = helpers.setHeader({ header: "X-Test", value: "test-value" });
		expect(code).toContain('reply.header("X-Test", "test-value")');
		expect(code).toContain("onSend");
	});

	it("next setHeader produces headers config with source pattern", () => {
		const helpers = getFrameworkHelpers("next");
		const code = helpers.setHeader({ header: "X-Test", value: "test-value" });
		expect(code).toContain('key: "X-Test"');
		expect(code).toContain('value: "test-value"');
		expect(code).toContain("/(.*)");
	});

	it("koa setHeader produces middleware with ctx.set()", () => {
		const helpers = getFrameworkHelpers("koa");
		const code = helpers.setHeader({ header: "X-Test", value: "test-value" });
		expect(code).toContain('ctx.set("X-Test", "test-value")');
	});

	it("hono setHeader produces middleware with c.header()", () => {
		const helpers = getFrameworkHelpers("hono");
		const code = helpers.setHeader({ header: "X-Test", value: "test-value" });
		expect(code).toContain('c.header("X-Test", "test-value")');
	});

	it("generic setHeader produces a comment", () => {
		const helpers = getFrameworkHelpers("generic");
		const code = helpers.setHeader({ header: "X-Test", value: "test-value" });
		expect(code).toContain("X-Test");
		expect(code).toContain("test-value");
	});
});

describe("getCookieConfigFn", () => {
	it("express generates session() config", () => {
		const fn = getCookieConfigFn("express");
		const code = fn({ secure: true, httpOnly: true, sameSite: "lax" });
		expect(code).toContain("session(");
		expect(code).toContain("secure: true");
		expect(code).toContain("httpOnly: true");
		expect(code).toContain('sameSite: "lax"');
	});

	it("fastify generates register(cookie) config", () => {
		const fn = getCookieConfigFn("fastify");
		const code = fn({ secure: true });
		expect(code).toContain("fastify.register(cookie");
		expect(code).toContain("secure: true");
	});

	it("next generates cookies().set() call", () => {
		const fn = getCookieConfigFn("next");
		const code = fn({ httpOnly: true, sameSite: "strict" });
		expect(code).toContain("cookies().set(");
		expect(code).toContain("httpOnly: true");
	});

	it("koa generates ctx.cookies.set() call", () => {
		const fn = getCookieConfigFn("koa");
		const code = fn({ secure: true, path: "/app" });
		expect(code).toContain("ctx.cookies.set(");
		expect(code).toContain('path: "/app"');
	});

	it("hono generates setCookie() call", () => {
		const fn = getCookieConfigFn("hono");
		const code = fn({ secure: true, maxAge: "86400" });
		expect(code).toContain("setCookie(c,");
		expect(code).toContain("maxAge: 86400");
	});

	it("generic generates Set-Cookie comment", () => {
		const fn = getCookieConfigFn("generic");
		const code = fn({ secure: true, httpOnly: true });
		expect(code).toContain("Set-Cookie");
		expect(code).toContain("Secure");
		expect(code).toContain("HttpOnly");
	});
});
