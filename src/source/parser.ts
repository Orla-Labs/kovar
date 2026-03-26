import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { SourceMetadata } from "./types.js";

interface ParserTraversePath {
	node: t.Node;
	parent: t.Node;
	parentPath: ParserTraversePath | null;
	stop: () => void;
}

const traverse: (
	ast: t.File,
	visitors: Record<string, (path: ParserTraversePath) => void>,
) => void =
	typeof _traverse === "function"
		? _traverse
		: (_traverse as { default: typeof _traverse }).default;

const astCache = new Map<string, t.File | null>();

function getAST(filePath: string): t.File | null {
	if (astCache.has(filePath)) return astCache.get(filePath) ?? null;

	let code: string;
	try {
		code = readFileSync(filePath, "utf-8");
	} catch (error) {
		console.warn(
			`[kovar] Failed to parse source file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		astCache.set(filePath, null);
		return null;
	}

	try {
		const ast = parse(code, {
			sourceType: "module",
			plugins: ["jsx", "typescript", "decorators-legacy"],
			sourceFilename: filePath,
		});
		astCache.set(filePath, ast);
		return ast;
	} catch (error) {
		console.warn(
			`[kovar] Failed to parse source file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
		astCache.set(filePath, null);
		return null;
	}
}

export function clearSourceCache(): void {
	astCache.clear();
}

function getStringAttribute(
	attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[],
	name: string,
): string | null {
	for (const attr of attributes) {
		if (!t.isJSXAttribute(attr)) continue;
		if (!t.isJSXIdentifier(attr.name) || attr.name.name !== name) continue;
		if (t.isStringLiteral(attr.value)) return attr.value.value;
		if (t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression)) {
			return attr.value.expression.value;
		}
	}
	return null;
}

function extractIdentifierHandler(
	expr: t.Expression | t.JSXEmptyExpression | t.TSType,
): string | null {
	if (t.isIdentifier(expr)) return expr.name;
	return null;
}

function extractBlockBodyCalls(body: t.BlockStatement): string[] {
	const names: string[] = [];
	for (const stmt of body.body) {
		if (!t.isExpressionStatement(stmt)) continue;
		if (!t.isCallExpression(stmt.expression)) continue;
		if (t.isIdentifier(stmt.expression.callee)) {
			names.push(stmt.expression.callee.name);
		} else if (
			t.isMemberExpression(stmt.expression.callee) &&
			t.isIdentifier(stmt.expression.callee.property)
		) {
			names.push(stmt.expression.callee.property.name);
		}
	}
	return names;
}

function extractArrowBodyCalls(body: t.Expression): string[] {
	if (!t.isCallExpression(body)) return [];
	if (t.isIdentifier(body.callee)) return [body.callee.name];
	if (t.isMemberExpression(body.callee) && t.isIdentifier(body.callee.property)) {
		return [body.callee.property.name];
	}
	return [];
}

function getEventHandlerNames(attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]): string[] {
	const handlers: string[] = [];
	for (const attr of attributes) {
		if (!t.isJSXAttribute(attr)) continue;
		if (!t.isJSXIdentifier(attr.name)) continue;
		if (!/^on[A-Z]/.test(attr.name.name)) continue;
		if (!t.isJSXExpressionContainer(attr.value)) continue;

		const expr = attr.value.expression;
		const identName = extractIdentifierHandler(expr);
		if (identName) {
			handlers.push(identName);
		} else if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
			const startLen = handlers.length;
			if (t.isBlockStatement(expr.body)) {
				handlers.push(...extractBlockBodyCalls(expr.body));
			} else {
				handlers.push(...extractArrowBodyCalls(expr.body));
			}
			if (handlers.length === startLen) {
				handlers.push("(anonymous)");
			}
		}
	}
	return handlers;
}

function getElementTag(
	name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
	if (t.isJSXIdentifier(name)) return name.name;
	if (t.isJSXMemberExpression(name)) return `${getElementTag(name.object)}.${name.property.name}`;
	return "unknown";
}

function findEnclosingComponent(path: ParserTraversePath): string {
	let current: ParserTraversePath | null = path;
	while (current) {
		const node = current.node;
		if (t.isFunctionDeclaration(node) && node.id) {
			return node.id.name;
		}
		if (t.isVariableDeclarator(node) && t.isIdentifier(node.id)) {
			return node.id.name;
		}
		if (t.isExportDefaultDeclaration(node)) {
			const decl = node.declaration;
			if (t.isFunctionDeclaration(decl) && decl.id) return decl.id.name;
		}
		current = current.parentPath;
	}
	return "UnknownComponent";
}

export function parseSourceLocation(
	filePath: string,
	line: number,
	col: number,
): SourceMetadata | null {
	const ast = getAST(filePath);
	if (!ast) return null;

	let result: SourceMetadata | null = null;

	traverse(ast, {
		JSXOpeningElement(path: ParserTraversePath) {
			const loc = path.node.loc?.start;
			if (!loc || loc.line !== line) return;
			if (loc.column !== col) return;

			if (!t.isJSXOpeningElement(path.node)) return;
			const node = path.node;
			const tag = getElementTag(node.name);

			result = {
				componentName: findEnclosingComponent(path),
				filePath,
				line,
				column: col,
				elementTag: tag,
				testId: getStringAttribute(node.attributes, "data-testid"),
				ariaLabel: getStringAttribute(node.attributes, "aria-label"),
				role: getStringAttribute(node.attributes, "role"),
				eventHandlers: getEventHandlerNames(node.attributes),
				className:
					getStringAttribute(node.attributes, "className") ??
					getStringAttribute(node.attributes, "class"),
			};

			path.stop();
		},
	});

	return result;
}
