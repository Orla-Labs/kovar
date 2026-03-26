import type { SecurityFinding } from "../types/results.js";
import { escapeStr } from "./frameworks.js";
import type { Framework, RemediationSuggestion } from "./types.js";

interface XSSCodeTemplate {
	code: string;
	filePath: string;
}

function expressXSSTemplate(language: "typescript" | "javascript"): XSSCodeTemplate {
	const typeAnnotation = language === "typescript" ? ": string" : "";
	return {
		code: [
			`import he from "he";`,
			"",
			`function sanitizeInput(input${typeAnnotation})${typeAnnotation} {`,
			"\treturn he.encode(input);",
			"}",
			"",
			"app.use((req, res, next) => {",
			"\tfor (const key of Object.keys(req.body)) {",
			`\t\tif (typeof req.body[key] === "string") {`,
			"\t\t\treq.body[key] = sanitizeInput(req.body[key]);",
			"\t\t}",
			"\t}",
			"\tnext();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function nextXSSTemplate(): XSSCodeTemplate {
	return {
		code: [
			"// React auto-escapes JSX expressions by default.",
			"// NEVER use dangerouslySetInnerHTML with user input:",
			"//   <div dangerouslySetInnerHTML={{ __html: userInput }} /> // UNSAFE",
			"//",
			"// Instead, render user content as text:",
			"//   <div>{userInput}</div> // SAFE — React escapes this",
			"//",
			"// If you must render HTML, sanitize it first:",
			`import DOMPurify from "dompurify";`,
			"",
			"function SafeHTML({ html }: { html: string }) {",
			"\treturn <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;",
			"}",
		].join("\n"),
		filePath: "components/SafeHTML.tsx",
	};
}

function fastifyXSSTemplate(language: "typescript" | "javascript"): XSSCodeTemplate {
	const typeAnnotation = language === "typescript" ? ": string" : "";
	return {
		code: [
			`import he from "he";`,
			"",
			`function sanitizeInput(input${typeAnnotation})${typeAnnotation} {`,
			"\treturn he.encode(input);",
			"}",
			"",
			`fastify.addHook("preHandler", async (request) => {`,
			`\tif (request.body && typeof request.body === "object") {`,
			"\t\tfor (const key of Object.keys(request.body)) {",
			`\t\t\tif (typeof (request.body as Record<string, unknown>)[key] === "string") {`,
			"\t\t\t\t(request.body as Record<string, string>)[key] = sanitizeInput(",
			"\t\t\t\t\t(request.body as Record<string, string>)[key],",
			"\t\t\t\t);",
			"\t\t\t}",
			"\t\t}",
			"\t}",
			"});",
		].join("\n"),
		filePath: "plugins/security.ts",
	};
}

function koaXSSTemplate(language: "typescript" | "javascript"): XSSCodeTemplate {
	const typeAnnotation = language === "typescript" ? ": string" : "";
	return {
		code: [
			`import he from "he";`,
			"",
			`function sanitizeInput(input${typeAnnotation})${typeAnnotation} {`,
			"\treturn he.encode(input);",
			"}",
			"",
			"app.use(async (ctx, next) => {",
			`\tif (ctx.request.body && typeof ctx.request.body === "object") {`,
			"\t\tfor (const key of Object.keys(ctx.request.body)) {",
			`\t\t\tif (typeof ctx.request.body[key] === "string") {`,
			"\t\t\t\tctx.request.body[key] = sanitizeInput(ctx.request.body[key]);",
			"\t\t\t}",
			"\t\t}",
			"\t}",
			"\tawait next();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function honoXSSTemplate(language: "typescript" | "javascript"): XSSCodeTemplate {
	const typeAnnotation = language === "typescript" ? ": string" : "";
	return {
		code: [
			`import he from "he";`,
			"",
			`function sanitizeInput(input${typeAnnotation})${typeAnnotation} {`,
			"\treturn he.encode(input);",
			"}",
			"",
			`app.use("*", async (c, next) => {`,
			"\tconst body = await c.req.parseBody();",
			"\tfor (const key of Object.keys(body)) {",
			`\t\tif (typeof body[key] === "string") {`,
			"\t\t\tbody[key] = sanitizeInput(body[key] as string);",
			"\t\t}",
			"\t}",
			"\tawait next();",
			"});",
		].join("\n"),
		filePath: "middleware.ts",
	};
}

function genericXSSTemplate(): XSSCodeTemplate {
	return {
		code: [
			"// HTML-encode all user input before rendering:",
			"// 1. Replace & with &amp;",
			"// 2. Replace < with &lt;",
			"// 3. Replace > with &gt;",
			`// 4. Replace " with &quot;`,
			`// 5. Replace ' with &#x27;`,
			"//",
			"// Use a trusted library (e.g., he, DOMPurify) instead of manual escaping.",
			"// Never insert user input into innerHTML, document.write(), or eval().",
		].join("\n"),
		filePath: "server.ts",
	};
}

const XSS_TEMPLATE_FNS: Record<
	Framework,
	(language: "typescript" | "javascript") => XSSCodeTemplate
> = {
	express: expressXSSTemplate,
	fastify: fastifyXSSTemplate,
	next: () => nextXSSTemplate(),
	koa: koaXSSTemplate,
	hono: honoXSSTemplate,
	generic: () => genericXSSTemplate(),
};

const XSS_REFERENCES = [
	"https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
	"https://developer.mozilla.org/en-US/docs/Glossary/Cross-site_scripting",
];

export function remediateXSS(
	findings: SecurityFinding[],
	framework: Framework,
	language: "typescript" | "javascript",
): { suggestions: RemediationSuggestion[]; unsupported: string[] } {
	const suggestions: RemediationSuggestion[] = [];
	const unsupported: string[] = [];
	const seenEndpoints = new Set<string>();

	for (const finding of findings) {
		if (finding.category !== "xss") continue;

		if (!finding.id.startsWith("xss-")) {
			unsupported.push(finding.id);
			continue;
		}

		if (finding.id === "xss-no-forms") continue;

		const endpoint = finding.url ?? finding.evidence ?? finding.id;
		if (seenEndpoints.has(endpoint)) continue;
		seenEndpoints.add(endpoint);

		const template = XSS_TEMPLATE_FNS[framework](language);
		const escapedMessage = escapeStr(finding.message);

		suggestions.push({
			findingId: finding.id,
			framework,
			description: `Sanitize user input to prevent XSS: ${escapedMessage}`,
			code: template.code,
			filePath: template.filePath,
			language,
			confidence: "high",
			references: XSS_REFERENCES,
		});
	}

	return { suggestions, unsupported };
}
