export type Framework = "express" | "fastify" | "next" | "koa" | "hono" | "generic";

export interface RemediationSuggestion {
	findingId: string;
	framework: Framework;
	description: string;
	code: string;
	filePath?: string;
	language: "typescript" | "javascript";
	confidence: "high" | "medium" | "low";
	references: string[];
}

export interface RemediationReport {
	findings: number;
	suggestions: RemediationSuggestion[];
	unsupported: string[];
}
