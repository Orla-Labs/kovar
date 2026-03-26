import type { SecurityFinding } from "../types/results.js";
import { escapeStr } from "./frameworks.js";
import type { Framework, RemediationSuggestion } from "./types.js";

interface CSRFRemediation {
	description: string;
	confidence: RemediationSuggestion["confidence"];
	references: string[];
	codeGenerators: Record<Framework, (language: "typescript" | "javascript") => CSRFCodeTemplate>;
}

interface CSRFCodeTemplate {
	code: string;
	filePath: string;
}

function expressCSRFMiddleware(): CSRFCodeTemplate {
	return {
		code: [
			`import csrf from "csurf";`,
			`import cookieParser from "cookie-parser";`,
			"",
			"app.use(cookieParser());",
			"app.use(csrf({ cookie: true }));",
			"",
			"// Include token in responses for forms:",
			"app.use((req, res, next) => {",
			"\tres.locals.csrfToken = req.csrfToken();",
			"\tnext();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifyCSRFMiddleware(): CSRFCodeTemplate {
	return {
		code: [
			`import csrfProtection from "@fastify/csrf-protection";`,
			`import fastifyCookie from "@fastify/cookie";`,
			"",
			"await fastify.register(fastifyCookie);",
			"await fastify.register(csrfProtection, {",
			"\tcookieOpts: { signed: true },",
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextCSRFMiddleware(): CSRFCodeTemplate {
	return {
		code: [
			`import Csrf from "csrf";`,
			"",
			"const csrf = new Csrf();",
			"const secret = csrf.secretSync();",
			"",
			"export async function middleware(request: Request) {",
			`\tif (request.method !== "GET") {`,
			`\t\tconst token = request.headers.get("x-csrf-token");`,
			"\t\tif (!token || !csrf.verify(secret, token)) {",
			`\t\t\treturn new Response("Invalid CSRF token", { status: 403 });`,
			"\t\t}",
			"\t}",
			"}",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function koaCSRFMiddleware(): CSRFCodeTemplate {
	return {
		code: [
			`import CSRF from "koa-csrf";`,
			`import session from "koa-session";`,
			"",
			"app.use(session(app));",
			"app.use(new CSRF());",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoCSRFMiddleware(): CSRFCodeTemplate {
	return {
		code: [
			`import { getCookie, setCookie } from "hono/cookie";`,
			`import { createMiddleware } from "hono/factory";`,
			"",
			"const csrfProtection = createMiddleware(async (c, next) => {",
			`\tif (c.req.method !== "GET") {`,
			`\t\tconst token = c.req.header("x-csrf-token");`,
			`\t\tconst cookieToken = getCookie(c, "csrf-token");`,
			"\t\tif (!token || token !== cookieToken) {",
			`\t\t\treturn c.text("Invalid CSRF token", 403);`,
			"\t\t}",
			"\t}",
			"\tawait next();",
			"});",
			"",
			`app.use("*", csrfProtection);`,
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericCSRFMiddleware(): CSRFCodeTemplate {
	return {
		code: [
			"// Add CSRF protection to state-changing endpoints:",
			"// 1. Generate a unique CSRF token per session",
			"// 2. Include the token in forms via a hidden field or meta tag",
			"// 3. Validate the token on every POST/PUT/DELETE/PATCH request",
			"// 4. Reject requests with missing or invalid tokens (return 403)",
		].join("\n"),
		filePath: "server.ts",
	};
}

function expressCSRFTokenInResponse(): CSRFCodeTemplate {
	return {
		code: [
			"app.use((req, res, next) => {",
			"\tres.locals.csrfToken = req.csrfToken();",
			"\tnext();",
			"});",
			"",
			"// In your template/view, include:",
			`// <meta name="csrf-token" content="<%= csrfToken %>">`,
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifyCSRFTokenInResponse(): CSRFCodeTemplate {
	return {
		code: [
			`fastify.addHook("onRequest", async (request, reply) => {`,
			"\tconst token = reply.generateCsrf();",
			`\treply.header("x-csrf-token", token);`,
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextCSRFTokenInResponse(): CSRFCodeTemplate {
	return {
		code: [
			`import Csrf from "csrf";`,
			"",
			"const csrf = new Csrf();",
			"const secret = csrf.secretSync();",
			"",
			"export async function getServerSideProps() {",
			"\tconst token = csrf.create(secret);",
			"\treturn { props: { csrfToken: token } };",
			"}",
		].join("\n"),
		filePath: "pages/index.tsx",
	};
}

function koaCSRFTokenInResponse(): CSRFCodeTemplate {
	return {
		code: [
			"app.use(async (ctx, next) => {",
			"\tctx.state.csrfToken = ctx.csrf;",
			"\tawait next();",
			"});",
			"",
			"// In your template, include:",
			`// <meta name="csrf-token" content="<%= csrfToken %>">`,
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoCSRFTokenInResponse(): CSRFCodeTemplate {
	return {
		code: [
			`import { setCookie } from "hono/cookie";`,
			`import crypto from "node:crypto";`,
			"",
			`app.use("*", async (c, next) => {`,
			`\tif (c.req.method === "GET") {`,
			`\t\tconst token = crypto.randomBytes(32).toString("hex");`,
			`\t\tsetCookie(c, "csrf-token", token, { httpOnly: true, sameSite: "Strict" });`,
			`\t\tc.header("x-csrf-token", token);`,
			"\t}",
			"\tawait next();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericCSRFTokenInResponse(): CSRFCodeTemplate {
	return {
		code: [
			"// Include a CSRF token in your HTML responses:",
			`// <meta name="csrf-token" content="GENERATED_TOKEN_HERE">`,
			"//",
			"// Or include it as a hidden form field:",
			`// <input type="hidden" name="_csrf" value="GENERATED_TOKEN_HERE">`,
		].join("\n"),
		filePath: "server.ts",
	};
}

function expressSameSiteFix(): CSRFCodeTemplate {
	return {
		code: [
			"app.use(session({",
			"\tcookie: {",
			`\t\tsameSite: "strict",`,
			"\t\tsecure: true,",
			"\t\thttpOnly: true,",
			"\t},",
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifySameSiteFix(): CSRFCodeTemplate {
	return {
		code: [
			"await fastify.register(fastifyCookie, {",
			"\tparseOptions: {",
			`\t\tsameSite: "strict",`,
			"\t\tsecure: true,",
			"\t\thttpOnly: true,",
			"\t},",
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextSameSiteFix(): CSRFCodeTemplate {
	return {
		code: [
			`cookies().set("session", value, {`,
			`\tsameSite: "strict",`,
			"\tsecure: true,",
			"\thttpOnly: true,",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function koaSameSiteFix(): CSRFCodeTemplate {
	return {
		code: [
			`ctx.cookies.set("session", value, {`,
			`\tsameSite: "strict",`,
			"\tsecure: true,",
			"\thttpOnly: true,",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoSameSiteFix(): CSRFCodeTemplate {
	return {
		code: [
			`import { setCookie } from "hono/cookie";`,
			"",
			`setCookie(c, "session", value, {`,
			`\tsameSite: "Strict",`,
			"\tsecure: true,",
			"\thttpOnly: true,",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericSameSiteFix(): CSRFCodeTemplate {
	return {
		code: [
			"// Set SameSite=Strict on all session cookies:",
			"// Set-Cookie: session=value; SameSite=Strict; Secure; HttpOnly",
		].join("\n"),
		filePath: "server.ts",
	};
}

const CSRF_REMEDIATIONS: Record<string, CSRFRemediation> = {
	"csrf-unprotected-endpoint": {
		description: "Add CSRF protection middleware to state-changing endpoints",
		confidence: "high",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Glossary/CSRF",
		],
		codeGenerators: {
			express: () => expressCSRFMiddleware(),
			fastify: () => fastifyCSRFMiddleware(),
			next: () => nextCSRFMiddleware(),
			koa: () => koaCSRFMiddleware(),
			hono: () => honoCSRFMiddleware(),
			generic: () => genericCSRFMiddleware(),
		},
	},
	"csrf-no-token-in-response": {
		description: "Include a CSRF token in HTML responses for client-side submission",
		confidence: "high",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#synchronizer-token-pattern",
			"https://developer.mozilla.org/en-US/docs/Glossary/CSRF",
		],
		codeGenerators: {
			express: () => expressCSRFTokenInResponse(),
			fastify: () => fastifyCSRFTokenInResponse(),
			next: () => nextCSRFTokenInResponse(),
			koa: () => koaCSRFTokenInResponse(),
			hono: () => honoCSRFTokenInResponse(),
			generic: () => genericCSRFTokenInResponse(),
		},
	},
	"csrf-weak-samesite": {
		description: "Strengthen SameSite cookie attribute to Strict or Lax for CSRF defense-in-depth",
		confidence: "high",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#samesite-cookie-attribute",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitesamesite-value",
		],
		codeGenerators: {
			express: () => expressSameSiteFix(),
			fastify: () => fastifySameSiteFix(),
			next: () => nextSameSiteFix(),
			koa: () => koaSameSiteFix(),
			hono: () => honoSameSiteFix(),
			generic: () => genericSameSiteFix(),
		},
	},
};

export function remediateCSRF(
	findings: SecurityFinding[],
	framework: Framework,
	language: "typescript" | "javascript",
): { suggestions: RemediationSuggestion[]; unsupported: string[] } {
	const suggestions: RemediationSuggestion[] = [];
	const unsupported: string[] = [];

	for (const finding of findings) {
		if (!finding.id.startsWith("csrf-")) continue;

		const remediation = CSRF_REMEDIATIONS[finding.id];
		if (!remediation) {
			unsupported.push(finding.id);
			continue;
		}

		const template = remediation.codeGenerators[framework](language);
		const escapedUrl = finding.url ? escapeStr(finding.url) : undefined;

		suggestions.push({
			findingId: finding.id,
			framework,
			description: escapedUrl
				? `${remediation.description} (${escapedUrl})`
				: remediation.description,
			code: template.code,
			filePath: template.filePath,
			language,
			confidence: remediation.confidence,
			references: remediation.references,
		});
	}

	return { suggestions, unsupported };
}
