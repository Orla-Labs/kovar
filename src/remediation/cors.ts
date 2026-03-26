import type { SecurityFinding } from "../types/results.js";
import { escapeStr } from "./frameworks.js";
import type { Framework, RemediationSuggestion } from "./types.js";

interface CORSRemediation {
	description: string;
	confidence: RemediationSuggestion["confidence"];
	references: string[];
	codeGenerators: Record<Framework, (language: "typescript" | "javascript") => CORSCodeTemplate>;
}

interface CORSCodeTemplate {
	code: string;
	filePath: string;
}

function expressOriginWhitelist(): CORSCodeTemplate {
	return {
		code: [
			`import cors from "cors";`,
			"",
			"const allowedOrigins = [",
			`\t"https://app.example.com",`,
			`\t"https://admin.example.com",`,
			"];",
			"",
			"app.use(cors({",
			"\torigin: (origin, callback) => {",
			"\t\tif (!origin || allowedOrigins.includes(origin)) {",
			"\t\t\tcallback(null, true);",
			"\t\t} else {",
			`\t\t\tcallback(new Error("Not allowed by CORS"));`,
			"\t\t}",
			"\t},",
			"\tcredentials: true,",
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifyOriginWhitelist(): CORSCodeTemplate {
	return {
		code: [
			`import fastifyCors from "@fastify/cors";`,
			"",
			"const allowedOrigins = [",
			`\t"https://app.example.com",`,
			`\t"https://admin.example.com",`,
			"];",
			"",
			"await fastify.register(fastifyCors, {",
			"\torigin: allowedOrigins,",
			"\tcredentials: true,",
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextOriginWhitelist(): CORSCodeTemplate {
	return {
		code: [
			"// next.config.js",
			"const allowedOrigins = [",
			`\t"https://app.example.com",`,
			`\t"https://admin.example.com",`,
			"];",
			"",
			"export async function middleware(request: Request) {",
			`\tconst origin = request.headers.get("origin");`,
			"\tif (origin && !allowedOrigins.includes(origin)) {",
			`\t\treturn new Response("Forbidden", { status: 403 });`,
			"\t}",
			"\tconst response = new Response(null, {",
			"\t\theaders: {",
			`\t\t\t"Access-Control-Allow-Origin": origin ?? "",`,
			`\t\t\t"Access-Control-Allow-Credentials": "true",`,
			"\t\t},",
			"\t});",
			"\treturn response;",
			"}",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function koaOriginWhitelist(): CORSCodeTemplate {
	return {
		code: [
			`import cors from "@koa/cors";`,
			"",
			"const allowedOrigins = [",
			`\t"https://app.example.com",`,
			`\t"https://admin.example.com",`,
			"];",
			"",
			"app.use(cors({",
			"\torigin: (ctx) => {",
			`\t\tconst origin = ctx.get("Origin");`,
			`\t\treturn allowedOrigins.includes(origin) ? origin : "";`,
			"\t},",
			"\tcredentials: true,",
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoOriginWhitelist(): CORSCodeTemplate {
	return {
		code: [
			`import { cors } from "hono/cors";`,
			"",
			"const allowedOrigins = [",
			`\t"https://app.example.com",`,
			`\t"https://admin.example.com",`,
			"];",
			"",
			`app.use("*", cors({`,
			"\torigin: allowedOrigins,",
			"\tcredentials: true,",
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericOriginWhitelist(): CORSCodeTemplate {
	return {
		code: [
			"// Validate the Origin header against a strict allowlist:",
			`// const allowedOrigins = ["https://app.example.com"];`,
			"// if (allowedOrigins.includes(requestOrigin)) {",
			`//   setHeader("Access-Control-Allow-Origin", requestOrigin);`,
			"// }",
			"// NEVER reflect the Origin header without validation.",
		].join("\n"),
		filePath: "server.ts",
	};
}

function expressRestrictMethods(): CORSCodeTemplate {
	return {
		code: [
			"app.use(cors({",
			"\torigin: allowedOrigins,",
			`\tmethods: ["GET", "POST"],`,
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifyRestrictMethods(): CORSCodeTemplate {
	return {
		code: [
			"await fastify.register(fastifyCors, {",
			"\torigin: allowedOrigins,",
			`\tmethods: ["GET", "POST"],`,
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextRestrictMethods(): CORSCodeTemplate {
	return {
		code: [
			"// In your API route or middleware, restrict allowed methods:",
			`const allowedMethods = ["GET", "POST"];`,
			`const method = request.headers.get("Access-Control-Request-Method");`,
			"if (method && !allowedMethods.includes(method)) {",
			`\treturn new Response("Method not allowed", { status: 405 });`,
			"}",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function koaRestrictMethods(): CORSCodeTemplate {
	return {
		code: [
			"app.use(cors({",
			"\torigin: allowedOrigins,",
			`\tallowMethods: ["GET", "POST"],`,
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoRestrictMethods(): CORSCodeTemplate {
	return {
		code: [
			`app.use("*", cors({`,
			"\torigin: allowedOrigins,",
			`\tallowMethods: ["GET", "POST"],`,
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericRestrictMethods(): CORSCodeTemplate {
	return {
		code: [
			"// Restrict Access-Control-Allow-Methods to only the methods your API needs:",
			"// Access-Control-Allow-Methods: GET, POST",
			"// Do not include PUT, DELETE, or PATCH unless required.",
		].join("\n"),
		filePath: "server.ts",
	};
}

function expressRestrictHeaders(): CORSCodeTemplate {
	return {
		code: [
			"app.use(cors({",
			"\torigin: allowedOrigins,",
			`\tallowedHeaders: ["Content-Type", "Authorization"],`,
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function fastifyRestrictHeaders(): CORSCodeTemplate {
	return {
		code: [
			"await fastify.register(fastifyCors, {",
			"\torigin: allowedOrigins,",
			`\tallowedHeaders: ["Content-Type", "Authorization"],`,
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function nextRestrictHeaders(): CORSCodeTemplate {
	return {
		code: [
			"// In your API route or middleware, restrict allowed headers:",
			"const response = new Response(null, {",
			"\theaders: {",
			`\t\t"Access-Control-Allow-Headers": "Content-Type, Authorization",`,
			"\t},",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function koaRestrictHeaders(): CORSCodeTemplate {
	return {
		code: [
			"app.use(cors({",
			"\torigin: allowedOrigins,",
			`\tallowHeaders: ["Content-Type", "Authorization"],`,
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoRestrictHeaders(): CORSCodeTemplate {
	return {
		code: [
			`app.use("*", cors({`,
			"\torigin: allowedOrigins,",
			`\tallowHeaders: ["Content-Type", "Authorization"],`,
			"}));",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericRestrictHeaders(): CORSCodeTemplate {
	return {
		code: [
			"// Restrict Access-Control-Allow-Headers to only the headers your API needs:",
			"// Access-Control-Allow-Headers: Content-Type, Authorization",
			"// Do not use a wildcard (*) for allowed headers.",
		].join("\n"),
		filePath: "server.ts",
	};
}

const CORS_REMEDIATIONS: Record<string, CORSRemediation> = {
	"cors-reflected-origin": {
		description: "Implement an origin allowlist instead of reflecting the Origin header",
		confidence: "high",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS",
		],
		codeGenerators: {
			express: () => expressOriginWhitelist(),
			fastify: () => fastifyOriginWhitelist(),
			next: () => nextOriginWhitelist(),
			koa: () => koaOriginWhitelist(),
			hono: () => honoOriginWhitelist(),
			generic: () => genericOriginWhitelist(),
		},
	},
	"cors-wildcard-origin": {
		description: "Restrict Access-Control-Allow-Origin to specific trusted origins",
		confidence: "high",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS",
		],
		codeGenerators: {
			express: () => expressOriginWhitelist(),
			fastify: () => fastifyOriginWhitelist(),
			next: () => nextOriginWhitelist(),
			koa: () => koaOriginWhitelist(),
			hono: () => honoOriginWhitelist(),
			generic: () => genericOriginWhitelist(),
		},
	},
	"cors-wildcard-with-credentials": {
		description:
			"Never combine Access-Control-Allow-Origin: * with credentials — use specific origins",
		confidence: "high",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSNotSupportingCredentials",
		],
		codeGenerators: {
			express: () => expressOriginWhitelist(),
			fastify: () => fastifyOriginWhitelist(),
			next: () => nextOriginWhitelist(),
			koa: () => koaOriginWhitelist(),
			hono: () => honoOriginWhitelist(),
			generic: () => genericOriginWhitelist(),
		},
	},
	"cors-permissive-methods": {
		description: "Restrict Access-Control-Allow-Methods to only the HTTP methods your API needs",
		confidence: "medium",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Methods",
		],
		codeGenerators: {
			express: () => expressRestrictMethods(),
			fastify: () => fastifyRestrictMethods(),
			next: () => nextRestrictMethods(),
			koa: () => koaRestrictMethods(),
			hono: () => honoRestrictMethods(),
			generic: () => genericRestrictMethods(),
		},
	},
	"cors-permissive-headers": {
		description: "Restrict Access-Control-Allow-Headers to only the headers your API requires",
		confidence: "medium",
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Headers",
		],
		codeGenerators: {
			express: () => expressRestrictHeaders(),
			fastify: () => fastifyRestrictHeaders(),
			next: () => nextRestrictHeaders(),
			koa: () => koaRestrictHeaders(),
			hono: () => honoRestrictHeaders(),
			generic: () => genericRestrictHeaders(),
		},
	},
};

export function remediateCORS(
	findings: SecurityFinding[],
	framework: Framework,
	language: "typescript" | "javascript",
): { suggestions: RemediationSuggestion[]; unsupported: string[] } {
	const suggestions: RemediationSuggestion[] = [];
	const unsupported: string[] = [];

	for (const finding of findings) {
		if (!finding.id.startsWith("cors-")) continue;

		const remediation = CORS_REMEDIATIONS[finding.id];
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
