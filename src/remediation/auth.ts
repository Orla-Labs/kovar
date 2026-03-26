import type { SecurityFinding } from "../types/results.js";
import { escapeStr } from "./frameworks.js";
import type { Framework, RemediationSuggestion } from "./types.js";

interface AuthRemediation {
	description: string;
	confidence: RemediationSuggestion["confidence"];
	references: string[];
	codeGenerators: Record<Framework, (language: "typescript" | "javascript") => AuthCodeTemplate>;
}

interface AuthCodeTemplate {
	code: string;
	filePath: string;
}

function expressAuthMiddleware(language: "typescript" | "javascript"): AuthCodeTemplate {
	const typeAnnotation =
		language === "typescript" ? ": Request, res: Response, next: NextFunction" : ", res, next";
	return {
		code: [
			`import jwt from "jsonwebtoken";`,
			"",
			`function requireAuth(req${typeAnnotation}) {`,
			`\tconst token = req.headers.authorization?.split(" ")[1];`,
			"\tif (!token) {",
			`\t\treturn res.status(401).json({ error: "Authentication required" });`,
			"\t}",
			"\ttry {",
			"\t\tconst decoded = jwt.verify(token, process.env.JWT_SECRET);",
			"\t\treq.user = decoded;",
			"\t\tnext();",
			"\t} catch {",
			`\t\treturn res.status(401).json({ error: "Invalid token" });`,
			"\t}",
			"}",
			"",
			`app.use("/api", requireAuth);`,
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifyAuthMiddleware(language: "typescript" | "javascript"): AuthCodeTemplate {
	const typeAnnotation =
		language === "typescript" ? ": FastifyRequest, reply: FastifyReply" : ", reply";
	return {
		code: [
			`import fastifyAuth from "@fastify/auth";`,
			`import fastifyJwt from "@fastify/jwt";`,
			"",
			"await fastify.register(fastifyJwt, {",
			"\tsecret: process.env.JWT_SECRET,",
			"});",
			"",
			"await fastify.register(fastifyAuth);",
			"",
			`fastify.decorate("authenticate", async (request${typeAnnotation}) => {`,
			"\ttry {",
			"\t\tawait request.jwtVerify();",
			"\t} catch {",
			`\t\treply.code(401).send({ error: "Authentication required" });`,
			"\t}",
			"});",
			"",
			`fastify.addHook("onRequest", fastify.authenticate);`,
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextAuthMiddleware(): AuthCodeTemplate {
	return {
		code: [
			`import { getServerSession } from "next-auth";`,
			`import { authOptions } from "./auth-options";`,
			"",
			"export async function getServerSideProps(context) {",
			"\tconst session = await getServerSession(context.req, context.res, authOptions);",
			"\tif (!session) {",
			`\t\treturn { redirect: { destination: "/login", permanent: false } };`,
			"\t}",
			"\treturn { props: { session } };",
			"}",
			"",
			"// For API routes:",
			"export default async function handler(req, res) {",
			"\tconst session = await getServerSession(req, res, authOptions);",
			"\tif (!session) {",
			`\t\treturn res.status(401).json({ error: "Authentication required" });`,
			"\t}",
			"\t// Handle authenticated request",
			"}",
		].join("\n"),
		filePath: "pages/api/protected.ts",
	};
}

function koaAuthMiddleware(language: "typescript" | "javascript"): AuthCodeTemplate {
	const typeAnnotation = language === "typescript" ? ": Context, next: Next" : ", next";
	return {
		code: [
			`import jwt from "jsonwebtoken";`,
			"",
			`async function requireAuth(ctx${typeAnnotation}) {`,
			`\tconst token = ctx.get("Authorization")?.split(" ")[1];`,
			"\tif (!token) {",
			"\t\tctx.status = 401;",
			`\t\tctx.body = { error: "Authentication required" };`,
			"\t\treturn;",
			"\t}",
			"\ttry {",
			"\t\tconst decoded = jwt.verify(token, process.env.JWT_SECRET);",
			"\t\tctx.state.user = decoded;",
			"\t\tawait next();",
			"\t} catch {",
			"\t\tctx.status = 401;",
			`\t\tctx.body = { error: "Invalid token" };`,
			"\t}",
			"}",
			"",
			"app.use(requireAuth);",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoAuthMiddleware(language: "typescript" | "javascript"): AuthCodeTemplate {
	const typeAnnotation = language === "typescript" ? ": Context, next: Next" : ", next";
	return {
		code: [
			`import { jwt } from "hono/jwt";`,
			"",
			`app.use("/api/*", jwt({`,
			"\tsecret: process.env.JWT_SECRET,",
			"}));",
			"",
			"// Or custom middleware:",
			`app.use("/api/*", async (c${typeAnnotation}) => {`,
			`\tconst token = c.req.header("Authorization")?.split(" ")[1];`,
			"\tif (!token) {",
			`\t\treturn c.json({ error: "Authentication required" }, 401);`,
			"\t}",
			"\tawait next();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericAuthMiddleware(): AuthCodeTemplate {
	return {
		code: [
			"// Add authentication to protected endpoints:",
			"// 1. Check for Authorization header or session cookie",
			"// 2. Validate the token/session",
			"// 3. Return 401 Unauthorized for missing credentials",
			"// 4. Return 403 Forbidden for insufficient permissions",
			"// 5. Never expose sensitive data in error responses",
		].join("\n"),
		filePath: "server.ts",
	};
}

function expressRedirectFix(): AuthCodeTemplate {
	return {
		code: [
			"// For API endpoints, return 401 instead of redirecting:",
			`app.use("/api", (req, res, next) => {`,
			"\tif (!req.isAuthenticated()) {",
			`\t\treturn res.status(401).json({ error: "Authentication required" });`,
			"\t}",
			"\tnext();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifyRedirectFix(): AuthCodeTemplate {
	return {
		code: [
			"// For API endpoints, return 401 instead of redirecting:",
			`fastify.addHook("onRequest", async (request, reply) => {`,
			`\tif (request.url.startsWith("/api") && !request.user) {`,
			`\t\treply.code(401).send({ error: "Authentication required" });`,
			"\t}",
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextRedirectFix(): AuthCodeTemplate {
	return {
		code: [
			"// For API routes, return 401 instead of redirecting:",
			"export default async function handler(req, res) {",
			"\tconst session = await getServerSession(req, res, authOptions);",
			"\tif (!session) {",
			`\t\treturn res.status(401).json({ error: "Authentication required" });`,
			"\t}",
			"}",
		].join("\n"),
		filePath: "pages/api/protected.ts",
	};
}

function koaRedirectFix(): AuthCodeTemplate {
	return {
		code: [
			"// For API endpoints, return 401 instead of redirecting:",
			"app.use(async (ctx, next) => {",
			`\tif (ctx.path.startsWith("/api") && !ctx.state.user) {`,
			"\t\tctx.status = 401;",
			`\t\tctx.body = { error: "Authentication required" };`,
			"\t\treturn;",
			"\t}",
			"\tawait next();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoRedirectFix(): AuthCodeTemplate {
	return {
		code: [
			"// For API endpoints, return 401 instead of redirecting:",
			`app.use("/api/*", async (c, next) => {`,
			`\tif (!c.get("user")) {`,
			`\t\treturn c.json({ error: "Authentication required" }, 401);`,
			"\t}",
			"\tawait next();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericRedirectFix(): AuthCodeTemplate {
	return {
		code: [
			"// For API endpoints, return proper HTTP status codes:",
			"// - 401 Unauthorized for missing credentials",
			"// - 403 Forbidden for insufficient permissions",
			"// Do NOT redirect to a login page for API requests.",
		].join("\n"),
		filePath: "server.ts",
	};
}

function expressErrorSanitize(): AuthCodeTemplate {
	return {
		code: [
			"// Sanitize error responses to prevent information leakage:",
			"app.use((err, req, res, next) => {",
			"\tconsole.error(err);",
			"\tres.status(err.status || 500).json({",
			`\t\terror: "An error occurred",`,
			"\t});",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifyErrorSanitize(): AuthCodeTemplate {
	return {
		code: [
			"// Sanitize error responses to prevent information leakage:",
			"fastify.setErrorHandler(async (error, request, reply) => {",
			"\trequest.log.error(error);",
			"\treply.code(error.statusCode || 500).send({",
			`\t\terror: "An error occurred",`,
			"\t});",
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextErrorSanitize(): AuthCodeTemplate {
	return {
		code: [
			"// Sanitize error responses in API routes:",
			"export default async function handler(req, res) {",
			"\ttry {",
			"\t\t// Handle request",
			"\t} catch (error) {",
			"\t\tconsole.error(error);",
			`\t\tres.status(500).json({ error: "An error occurred" });`,
			"\t}",
			"}",
		].join("\n"),
		filePath: "pages/api/protected.ts",
	};
}

function koaErrorSanitize(): AuthCodeTemplate {
	return {
		code: [
			"// Sanitize error responses to prevent information leakage:",
			"app.use(async (ctx, next) => {",
			"\ttry {",
			"\t\tawait next();",
			"\t} catch (err) {",
			"\t\tconsole.error(err);",
			"\t\tctx.status = err.status || 500;",
			`\t\tctx.body = { error: "An error occurred" };`,
			"\t}",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoErrorSanitize(): AuthCodeTemplate {
	return {
		code: [
			"// Sanitize error responses to prevent information leakage:",
			"app.onError((err, c) => {",
			"\tconsole.error(err);",
			`\treturn c.json({ error: "An error occurred" }, 500);`,
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericErrorSanitize(): AuthCodeTemplate {
	return {
		code: [
			"// Sanitize error responses to prevent information leakage:",
			"// 1. Log detailed errors server-side only",
			"// 2. Return generic error messages to clients",
			"// 3. Never expose stack traces, SQL queries, or internal paths",
			"// 4. Use consistent error response format",
		].join("\n"),
		filePath: "server.ts",
	};
}

const AUTH_REMEDIATIONS: Record<string, AuthRemediation> = {
	"auth-missing-authentication": {
		description: "Add authentication middleware to protect endpoints from unauthorized access",
		confidence: "high",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication",
		],
		codeGenerators: {
			express: expressAuthMiddleware,
			fastify: fastifyAuthMiddleware,
			next: () => nextAuthMiddleware(),
			koa: koaAuthMiddleware,
			hono: honoAuthMiddleware,
			generic: () => genericAuthMiddleware(),
		},
	},
	"auth-redirect-based": {
		description: "Return 401/403 status codes instead of redirects for API endpoints",
		confidence: "medium",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401",
		],
		codeGenerators: {
			express: () => expressRedirectFix(),
			fastify: () => fastifyRedirectFix(),
			next: () => nextRedirectFix(),
			koa: () => koaRedirectFix(),
			hono: () => honoRedirectFix(),
			generic: () => genericRedirectFix(),
		},
	},
	"auth-error-info-leak": {
		description: "Sanitize error responses to prevent information disclosure",
		confidence: "high",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/500",
		],
		codeGenerators: {
			express: () => expressErrorSanitize(),
			fastify: () => fastifyErrorSanitize(),
			next: () => nextErrorSanitize(),
			koa: () => koaErrorSanitize(),
			hono: () => honoErrorSanitize(),
			generic: () => genericErrorSanitize(),
		},
	},
};

export function remediateAuth(
	findings: SecurityFinding[],
	framework: Framework,
	language: "typescript" | "javascript",
): { suggestions: RemediationSuggestion[]; unsupported: string[] } {
	const suggestions: RemediationSuggestion[] = [];
	const unsupported: string[] = [];

	for (const finding of findings) {
		if (!finding.id.startsWith("auth-")) continue;

		const remediation = AUTH_REMEDIATIONS[finding.id];
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
