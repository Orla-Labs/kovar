import * as t from "@babel/types";

const KOVAR_ATTR_PREFIX = "data-kovar-";

interface BabelPath {
	node: t.JSXOpeningElement;
	parent: t.Node;
}

interface BabelState {
	filename?: string;
	opts?: Record<string, unknown>;
}

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

export default function kovarBabelPlugin(): {
	visitor: Record<string, (path: BabelPath, state: BabelState) => void>;
} {
	return {
		visitor: {
			JSXOpeningElement(path: BabelPath, state: BabelState) {
				if (process.env.NODE_ENV === "production") return;

				const node = path.node;
				const parent = path.parent;

				if (isFragment(node, parent)) return;
				if (hasKovarAttributes(node.attributes)) return;

				const loc = node.loc?.start;
				if (!loc) return;

				const filePath = state.filename ?? "unknown";
				const relPath = filePath.replace(`${process.cwd()}/`, "");

				node.attributes.push(
					t.jsxAttribute(t.jsxIdentifier("data-kovar-file"), t.stringLiteral(relPath)),
					t.jsxAttribute(t.jsxIdentifier("data-kovar-line"), t.stringLiteral(String(loc.line))),
					t.jsxAttribute(t.jsxIdentifier("data-kovar-col"), t.stringLiteral(String(loc.column))),
				);
			},
		},
	};
}
