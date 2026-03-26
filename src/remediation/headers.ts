import type { SecurityFinding } from "../types/results.js";
import { type FrameworkHelpers, type HeaderTemplate, getFrameworkHelpers } from "./frameworks.js";
import type { Framework, RemediationSuggestion } from "./types.js";

interface HeaderRemediation {
	description: string;
	action: "set" | "remove";
	template: HeaderTemplate;
	references: string[];
	confidence: RemediationSuggestion["confidence"];
}

const HEADER_REMEDIATIONS: Record<string, HeaderRemediation> = {
	"header-missing-hsts": {
		description:
			"Enable HTTP Strict Transport Security. WARNING: includeSubDomains applies to ALL subdomains — verify they all support HTTPS before deploying.",
		action: "set",
		template: {
			header: "Strict-Transport-Security",
			value: "max-age=63072000; includeSubDomains",
		},
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security",
		],
		confidence: "medium",
	},
	"header-missing-csp": {
		description: "Set a Content Security Policy to prevent XSS and data injection attacks",
		action: "set",
		template: {
			header: "Content-Security-Policy",
			value:
				"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
		},
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP",
		],
		confidence: "medium",
	},
	"header-missing-xcto": {
		description: "Prevent MIME type sniffing by setting X-Content-Type-Options",
		action: "set",
		template: {
			header: "X-Content-Type-Options",
			value: "nosniff",
		},
		references: [
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options",
		],
		confidence: "high",
	},
	"header-missing-xfo": {
		description: "Prevent clickjacking by setting X-Frame-Options to DENY",
		action: "set",
		template: {
			header: "X-Frame-Options",
			value: "DENY",
		},
		references: [
			"https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html",
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options",
		],
		confidence: "high",
	},
	"header-missing-referrer-policy": {
		description: "Control referrer information sent with requests to protect user privacy",
		action: "set",
		template: {
			header: "Referrer-Policy",
			value: "strict-origin-when-cross-origin",
		},
		references: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy"],
		confidence: "high",
	},
	"header-missing-permissions-policy": {
		description: "Restrict browser features with Permissions-Policy to reduce attack surface",
		action: "set",
		template: {
			header: "Permissions-Policy",
			value: "camera=(), microphone=(), geolocation=()",
		},
		references: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy"],
		confidence: "medium",
	},
	"header-missing-coop": {
		description: "Isolate browsing context with Cross-Origin-Opener-Policy",
		action: "set",
		template: {
			header: "Cross-Origin-Opener-Policy",
			value: "same-origin",
		},
		references: [
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy",
		],
		confidence: "high",
	},
	"header-missing-corp": {
		description: "Restrict cross-origin resource loading with Cross-Origin-Resource-Policy",
		action: "set",
		template: {
			header: "Cross-Origin-Resource-Policy",
			value: "same-origin",
		},
		references: [
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Resource-Policy",
		],
		confidence: "high",
	},
	"header-missing-coep": {
		description: "Enforce cross-origin embedding restrictions with Cross-Origin-Embedder-Policy",
		action: "set",
		template: {
			header: "Cross-Origin-Embedder-Policy",
			value: "require-corp",
		},
		references: [
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy",
		],
		confidence: "high",
	},
	"header-deprecated-xxp": {
		description: "Remove deprecated X-XSS-Protection header — rely on CSP instead",
		action: "remove",
		template: {
			header: "X-XSS-Protection",
			value: "",
		},
		references: [
			"https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection",
			"https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
		],
		confidence: "high",
	},
	"header-remove-x-powered-by": {
		description: "Remove X-Powered-By header to avoid exposing server technology",
		action: "remove",
		template: {
			header: "X-Powered-By",
			value: "",
		},
		references: ["https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html"],
		confidence: "high",
	},
	"header-remove-server": {
		description: "Remove version information from Server header to prevent information disclosure",
		action: "remove",
		template: {
			header: "Server",
			value: "",
		},
		references: ["https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html"],
		confidence: "high",
	},
};

function buildSuggestion(
	finding: SecurityFinding,
	remediation: HeaderRemediation,
	helpers: FrameworkHelpers,
	framework: Framework,
	language: "typescript" | "javascript",
): RemediationSuggestion {
	const code =
		remediation.action === "set"
			? helpers.setHeader(remediation.template)
			: helpers.removeHeader(remediation.template.header);

	return {
		findingId: finding.id,
		framework,
		description: remediation.description,
		code,
		filePath: helpers.filePath,
		language,
		confidence: remediation.confidence,
		references: remediation.references,
	};
}

export function remediateHeaders(
	findings: SecurityFinding[],
	framework: Framework,
	language: "typescript" | "javascript",
): { suggestions: RemediationSuggestion[]; unsupported: string[] } {
	const helpers = getFrameworkHelpers(framework);
	const suggestions: RemediationSuggestion[] = [];
	const unsupported: string[] = [];

	for (const finding of findings) {
		if (finding.category !== "headers") continue;

		const remediation = HEADER_REMEDIATIONS[finding.id];
		if (!remediation) {
			unsupported.push(finding.id);
			continue;
		}

		suggestions.push(buildSuggestion(finding, remediation, helpers, framework, language));
	}

	return { suggestions, unsupported };
}
