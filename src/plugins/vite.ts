import { transformJSX } from "./babel-transform.js";

interface KovarPluginOptions {
	include?: RegExp;
	exclude?: RegExp;
}

const DEFAULT_INCLUDE = /\.(jsx|tsx)$/;
const DEFAULT_EXCLUDE = /node_modules/;

export function kovarSourcePlugin(options?: KovarPluginOptions) {
	const include = options?.include ?? DEFAULT_INCLUDE;
	const exclude = options?.exclude ?? DEFAULT_EXCLUDE;

	return {
		name: "kovar:source",
		enforce: "pre" as const,
		apply: "serve" as const,

		transform(code: string, id: string) {
			if (exclude.test(id)) return;
			if (!include.test(id)) return;
			return transformJSX(code, id);
		},
	};
}
