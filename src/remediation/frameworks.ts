import { readFileSync } from "node:fs";
import type { Framework } from "./types.js";

const FRAMEWORK_DEPS: [string, Framework][] = [
	["next", "next"],
	["hono", "hono"],
	["fastify", "fastify"],
	["koa", "koa"],
	["express", "express"],
];

export function detectFramework(packageJsonPath?: string): Framework {
	if (!packageJsonPath) return "generic";

	try {
		const raw = readFileSync(packageJsonPath, "utf-8");
		const pkg = JSON.parse(raw) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

		for (const [dep, framework] of FRAMEWORK_DEPS) {
			if (dep in allDeps) return framework;
		}
	} catch {
		return "generic";
	}

	return "generic";
}

function escapeStr(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

export interface HeaderTemplate {
	header: string;
	value: string;
}

export function expressSetHeader({ header, value }: HeaderTemplate): string {
	const h = escapeStr(header);
	const v = escapeStr(value);
	return `app.use((req, res, next) => {\n\tres.set("${h}", "${v}");\n\tnext();\n});`;
}

export function expressRemoveHeader(header: string): string {
	const h = escapeStr(header);
	return `app.use((req, res, next) => {\n\tres.removeHeader("${h}");\n\tnext();\n});`;
}

export function fastifySetHeader({ header, value }: HeaderTemplate): string {
	const h = escapeStr(header);
	const v = escapeStr(value);
	return `fastify.addHook("onSend", async (request, reply) => {\n\treply.header("${h}", "${v}");\n});`;
}

export function fastifyRemoveHeader(header: string): string {
	const h = escapeStr(header);
	return `fastify.addHook("onSend", async (request, reply) => {\n\treply.removeHeader("${h}");\n});`;
}

export function nextSetHeader({ header, value }: HeaderTemplate): string {
	const h = escapeStr(header);
	const v = escapeStr(value);
	return `headers: async () => [{\n\tsource: "/(.*)",\n\theaders: [{ key: "${h}", value: "${v}" }]\n}]`;
}

export function nextRemoveHeader(header: string): string {
	const h = escapeStr(header);
	return `headers: async () => [{\n\tsource: "/(.*)",\n\theaders: [{ key: "${h}", value: "" }]\n}]`;
}

export function koaSetHeader({ header, value }: HeaderTemplate): string {
	const h = escapeStr(header);
	const v = escapeStr(value);
	return `app.use(async (ctx, next) => {\n\tawait next();\n\tctx.set("${h}", "${v}");\n});`;
}

export function koaRemoveHeader(header: string): string {
	const h = escapeStr(header);
	return `app.use(async (ctx, next) => {\n\tawait next();\n\tctx.remove("${h}");\n});`;
}

export function honoSetHeader({ header, value }: HeaderTemplate): string {
	const h = escapeStr(header);
	const v = escapeStr(value);
	return `app.use("*", async (c, next) => {\n\tawait next();\n\tc.header("${h}", "${v}");\n});`;
}

export function honoRemoveHeader(header: string): string {
	const h = escapeStr(header);
	return `app.use("*", async (c, next) => {\n\tawait next();\n\tc.header("${h}", "");\n});`;
}

export function genericSetHeader({ header, value }: HeaderTemplate): string {
	const h = escapeStr(header);
	const v = escapeStr(value);
	return `// Set the following response header:\n// ${h}: ${v}`;
}

export function genericRemoveHeader(header: string): string {
	const h = escapeStr(header);
	return `// Remove the following response header:\n// ${h}`;
}

export type SetHeaderFn = (template: HeaderTemplate) => string;
export type RemoveHeaderFn = (header: string) => string;

export interface FrameworkHelpers {
	setHeader: SetHeaderFn;
	removeHeader: RemoveHeaderFn;
	filePath: string;
}

const FRAMEWORK_HELPERS: Record<Framework, FrameworkHelpers> = {
	express: {
		setHeader: expressSetHeader,
		removeHeader: expressRemoveHeader,
		filePath: "middleware.ts",
	},
	fastify: {
		setHeader: fastifySetHeader,
		removeHeader: fastifyRemoveHeader,
		filePath: "plugins/security.ts",
	},
	next: {
		setHeader: nextSetHeader,
		removeHeader: nextRemoveHeader,
		filePath: "next.config.js",
	},
	koa: {
		setHeader: koaSetHeader,
		removeHeader: koaRemoveHeader,
		filePath: "middleware.ts",
	},
	hono: {
		setHeader: honoSetHeader,
		removeHeader: honoRemoveHeader,
		filePath: "middleware.ts",
	},
	generic: {
		setHeader: genericSetHeader,
		removeHeader: genericRemoveHeader,
		filePath: "server.ts",
	},
};

export function getFrameworkHelpers(framework: Framework): FrameworkHelpers {
	return FRAMEWORK_HELPERS[framework];
}

export interface CookieTemplate {
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: string;
	maxAge?: string;
	path?: string;
}

export function expressCookieConfig(opts: CookieTemplate, cookieName?: string): string {
	const name = escapeStr(cookieName ?? "session_cookie");
	const parts: string[] = [];
	if (opts.secure) parts.push("secure: true");
	if (opts.httpOnly) parts.push("httpOnly: true");
	if (opts.sameSite) parts.push(`sameSite: "${opts.sameSite}"`);
	if (opts.maxAge) parts.push(`maxAge: ${opts.maxAge}`);
	if (opts.path) parts.push(`path: "${opts.path}"`);
	return `app.use(session({\n\tname: "${name}",\n\tcookie: { ${parts.join(", ")} }\n}));`;
}

export function fastifyCookieConfig(opts: CookieTemplate, cookieName?: string): string {
	const name = escapeStr(cookieName ?? "session_cookie");
	const parts: string[] = [];
	if (opts.secure) parts.push("secure: true");
	if (opts.httpOnly) parts.push("httpOnly: true");
	if (opts.sameSite) parts.push(`sameSite: "${opts.sameSite}"`);
	if (opts.maxAge) parts.push(`maxAge: ${opts.maxAge}`);
	if (opts.path) parts.push(`path: "${opts.path}"`);
	return `fastify.register(cookie, {\n\tparseOptions: { ${parts.join(", ")} }\n});\n// Cookie name: "${name}"`;
}

export function nextCookieConfig(opts: CookieTemplate, cookieName?: string): string {
	const name = escapeStr(cookieName ?? "session_cookie");
	const parts: string[] = [];
	if (opts.secure) parts.push("secure: true");
	if (opts.httpOnly) parts.push("httpOnly: true");
	if (opts.sameSite) parts.push(`sameSite: "${opts.sameSite}"`);
	if (opts.maxAge) parts.push(`maxAge: ${opts.maxAge}`);
	if (opts.path) parts.push(`path: "${opts.path}"`);
	return `cookies().set("${name}", value, { ${parts.join(", ")} });`;
}

export function koaCookieConfig(opts: CookieTemplate, cookieName?: string): string {
	const name = escapeStr(cookieName ?? "session_cookie");
	const parts: string[] = [];
	if (opts.secure) parts.push("secure: true");
	if (opts.httpOnly) parts.push("httpOnly: true");
	if (opts.sameSite) parts.push(`sameSite: "${opts.sameSite}"`);
	if (opts.maxAge) parts.push(`maxAge: ${opts.maxAge}`);
	if (opts.path) parts.push(`path: "${opts.path}"`);
	return `ctx.cookies.set("${name}", value, { ${parts.join(", ")} });`;
}

export function honoCookieConfig(opts: CookieTemplate, cookieName?: string): string {
	const name = escapeStr(cookieName ?? "session_cookie");
	const parts: string[] = [];
	if (opts.secure) parts.push("secure: true");
	if (opts.httpOnly) parts.push("httpOnly: true");
	if (opts.sameSite) parts.push(`sameSite: "${opts.sameSite}"`);
	if (opts.maxAge) parts.push(`maxAge: ${opts.maxAge}`);
	if (opts.path) parts.push(`path: "${opts.path}"`);
	return `setCookie(c, "${name}", value, { ${parts.join(", ")} });`;
}

export function genericCookieConfig(opts: CookieTemplate, cookieName?: string): string {
	const name = escapeStr(cookieName ?? "session_cookie");
	const parts: string[] = [];
	if (opts.secure) parts.push("Secure");
	if (opts.httpOnly) parts.push("HttpOnly");
	if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
	if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
	if (opts.path) parts.push(`Path=${opts.path}`);
	return `// Set-Cookie: ${name}=value; ${parts.join("; ")}`;
}

export type CookieConfigFn = (opts: CookieTemplate, cookieName?: string) => string;

const COOKIE_CONFIG_FNS: Record<Framework, CookieConfigFn> = {
	express: expressCookieConfig,
	fastify: fastifyCookieConfig,
	next: nextCookieConfig,
	koa: koaCookieConfig,
	hono: honoCookieConfig,
	generic: genericCookieConfig,
};

export function getCookieConfigFn(framework: Framework): CookieConfigFn {
	return COOKIE_CONFIG_FNS[framework];
}
