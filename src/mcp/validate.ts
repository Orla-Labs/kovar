import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ValidationError {
	path: string;
	message: string;
}

export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

interface SchemaNode {
	type?: string;
	properties?: Record<string, SchemaNode>;
	required?: string[];
	additionalProperties?: boolean;
	enum?: string[];
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	minItems?: number;
	items?: SchemaNode;
}

const MAX_ERRORS = 3;

function pushError(errors: ValidationError[], path: string, message: string): boolean {
	errors.push({ path, message });
	return errors.length >= MAX_ERRORS;
}

function pathOrRoot(path: string): string {
	return path || "(root)";
}

function typeOf(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	if (Number.isInteger(value)) return "integer";
	return typeof value;
}

function typeAllowed(expected: string, actual: string): boolean {
	if (expected === "number") return actual === "number" || actual === "integer";
	if (expected === "integer") return actual === "integer";
	return actual === expected;
}

function checkType(
	schema: SchemaNode,
	value: unknown,
	path: string,
	errors: ValidationError[],
): {
	stop: boolean;
	mismatch: boolean;
} {
	if (!schema.type) return { stop: false, mismatch: false };
	const t = typeOf(value);
	if (typeAllowed(schema.type, t)) return { stop: false, mismatch: false };
	const stop = pushError(errors, pathOrRoot(path), `expected ${schema.type}, got ${t}`);
	return { stop, mismatch: true };
}

function checkEnum(
	schema: SchemaNode,
	value: unknown,
	path: string,
	errors: ValidationError[],
): boolean {
	if (!schema.enum || typeof value !== "string") return false;
	if (schema.enum.includes(value)) return false;
	return pushError(
		errors,
		pathOrRoot(path),
		`expected one of [${schema.enum.join(", ")}], got "${value}"`,
	);
}

function checkNumberBounds(
	schema: SchemaNode,
	value: number,
	path: string,
	errors: ValidationError[],
): boolean {
	if (typeof schema.minimum === "number" && value < schema.minimum) {
		if (pushError(errors, pathOrRoot(path), `must be >= ${schema.minimum}`)) return true;
	}
	if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
		if (pushError(errors, pathOrRoot(path), `must be > ${schema.exclusiveMinimum}`)) return true;
	}
	if (typeof schema.maximum === "number" && value > schema.maximum) {
		if (pushError(errors, pathOrRoot(path), `must be <= ${schema.maximum}`)) return true;
	}
	return false;
}

function checkArray(
	schema: SchemaNode,
	value: unknown[],
	path: string,
	errors: ValidationError[],
): boolean {
	if (typeof schema.minItems === "number" && value.length < schema.minItems) {
		if (pushError(errors, pathOrRoot(path), `must have at least ${schema.minItems} item(s)`))
			return true;
	}
	if (schema.items) {
		for (let i = 0; i < value.length; i++) {
			if (validateNode(schema.items, value[i], `${path}[${i}]`, errors)) return true;
		}
	}
	return false;
}

function joinPath(path: string, key: string): string {
	return path ? `${path}.${key}` : key;
}

function checkRequired(
	schema: SchemaNode,
	obj: Record<string, unknown>,
	path: string,
	errors: ValidationError[],
): boolean {
	if (!schema.required) return false;
	for (const key of schema.required) {
		if (!(key in obj) && pushError(errors, joinPath(path, key), "is required")) return true;
	}
	return false;
}

function checkProperties(
	schema: SchemaNode,
	obj: Record<string, unknown>,
	path: string,
	errors: ValidationError[],
): boolean {
	if (!schema.properties) return false;
	for (const [k, sub] of Object.entries(schema.properties)) {
		if (k in obj && validateNode(sub, obj[k], joinPath(path, k), errors)) return true;
	}
	return false;
}

function checkAdditional(
	schema: SchemaNode,
	obj: Record<string, unknown>,
	path: string,
	errors: ValidationError[],
): boolean {
	if (schema.additionalProperties !== false || !schema.properties) return false;
	for (const k of Object.keys(obj)) {
		if (!(k in schema.properties) && pushError(errors, joinPath(path, k), "is not allowed")) {
			return true;
		}
	}
	return false;
}

function checkObject(
	schema: SchemaNode,
	obj: Record<string, unknown>,
	path: string,
	errors: ValidationError[],
): boolean {
	if (checkRequired(schema, obj, path, errors)) return true;
	if (checkProperties(schema, obj, path, errors)) return true;
	if (checkAdditional(schema, obj, path, errors)) return true;
	return false;
}

function validateNode(
	schema: SchemaNode,
	value: unknown,
	path: string,
	errors: ValidationError[],
): boolean {
	const t = checkType(schema, value, path, errors);
	if (t.stop) return true;
	if (t.mismatch) return false;
	if (checkEnum(schema, value, path, errors)) return true;
	if (typeof value === "number" && checkNumberBounds(schema, value, path, errors)) return true;
	if (Array.isArray(value) && checkArray(schema, value, path, errors)) return true;
	if (
		schema.type === "object" &&
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value)
	) {
		if (checkObject(schema, value as Record<string, unknown>, path, errors)) return true;
	}
	return false;
}

export function validateInput(schema: unknown, value: unknown): ValidationResult {
	const errors: ValidationError[] = [];
	validateNode(schema as SchemaNode, value, "", errors);
	if (errors.length === 0) return { ok: true };
	return { ok: false, errors };
}

let cachedVersion: string | null = null;

const PACKAGE_NAME = "@orlalabs/kovar";

function findPackageJson(): string {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 10; i++) {
		const candidate = join(dir, "package.json");
		if (existsSync(candidate)) {
			try {
				const parsed = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string };
				if (parsed.name === PACKAGE_NAME) return candidate;
			} catch {}
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error(`Could not locate package.json for ${PACKAGE_NAME}`);
}

export function readPackageVersion(): string {
	if (cachedVersion !== null) return cachedVersion;
	const pkg = JSON.parse(readFileSync(findPackageJson(), "utf8")) as { version: string };
	cachedVersion = pkg.version;
	return cachedVersion;
}
