import _generate from "@babel/generator";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";

// Handle CJS/ESM interop for Babel packages
const traverse = typeof _traverse === "function" ? _traverse : (_traverse as any).default;
const generate = typeof _generate === "function" ? _generate : (_generate as any).default;

const KOVAR_ATTR_PREFIX = "data-kovar-";

function hasKovarAttributes(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]): boolean {
	return attributes.some(
		(a) =>
			t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name.startsWith(KOVAR_ATTR_PREFIX),
	);
}

function isFragment(node: t.JSXOpeningElement, parent: t.Node): boolean {
	if (t.isJSXFragment(parent)) return true;
	const name = node.name;
	if (t.isJSXIdentifier(name) && (name.name === "Fragment" || name.name === "")) return true;
	if (
		t.isJSXMemberExpression(name) &&
		t.isJSXIdentifier(name.property) &&
		name.property.name === "Fragment"
	)
		return true;
	return false;
}

export function transformJSX(
	code: string,
	filePath: string,
): { code: string; map: unknown } | null {
	let ast: t.File;
	try {
		ast = parse(code, {
			sourceType: "module",
			plugins: ["jsx", "typescript", "decorators-legacy"],
			sourceFilename: filePath,
		});
	} catch {
		return null;
	}

	const relPath = filePath.replace(`${process.cwd()}/`, "");
	let modified = false;

	traverse(ast, {
		JSXOpeningElement(path: any) {
			const node = path.node as t.JSXOpeningElement;
			const parent = path.parent as t.Node;

			if (isFragment(node, parent)) return;
			if (hasKovarAttributes(node.attributes)) return;

			const loc = node.loc?.start;
			if (!loc) return;

			node.attributes.push(
				t.jsxAttribute(t.jsxIdentifier("data-kovar-file"), t.stringLiteral(relPath)),
				t.jsxAttribute(t.jsxIdentifier("data-kovar-line"), t.stringLiteral(String(loc.line))),
				t.jsxAttribute(t.jsxIdentifier("data-kovar-col"), t.stringLiteral(String(loc.column))),
			);
			modified = true;
		},
	});

	if (!modified) return null;

	const result = generate(ast, { sourceMaps: true, sourceFileName: filePath }, code);
	return { code: result.code, map: result.map };
}
