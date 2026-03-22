export type PayloadContext =
	| "html-body"
	| "html-attribute"
	| "script-string"
	| "template-literal"
	| "url"
	| "math-context"
	| "style-context";

export type PayloadDepth = "quick" | "standard" | "thorough";

export interface PayloadDefinition {
	id: string;
	name: string;
	payload: string;
	contexts: PayloadContext[];
	depth: PayloadDepth;
}
