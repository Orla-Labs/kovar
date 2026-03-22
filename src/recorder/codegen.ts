import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface GeneratedFiles {
	specPath: string;
	pagePath: string | null;
	envExamplePath: string | null;
}

function extractLabeledBlocks(llmResponse: string): { pages: string; spec: string } | null {
	const pagesMatch = llmResponse.match(/```(?:typescript|ts):pages\s*\n([\s\S]*?)```/);
	const specMatch = llmResponse.match(/```(?:typescript|ts):spec\s*\n([\s\S]*?)```/);
	if (pagesMatch && specMatch) {
		return {
			pages: normalizeImports(pagesMatch[1] ?? ""),
			spec: normalizeImports(specMatch[1] ?? ""),
		};
	}
	return null;
}

function extractAltLabeledBlocks(llmResponse: string): { pages: string; spec: string } | null {
	const pagesAlt = llmResponse.match(/```(?:typescript|ts):pages?\s*\n([\s\S]*?)```/i);
	const specAlt = llmResponse.match(/```(?:typescript|ts):(?:spec|test|tests)\s*\n([\s\S]*?)```/i);
	if (pagesAlt || specAlt) {
		return {
			pages: pagesAlt ? normalizeImports(pagesAlt[1] ?? "") : "",
			spec: specAlt ? normalizeImports(specAlt[1] ?? "") : "",
		};
	}
	return null;
}

function extractSingleBlock(llmResponse: string): { pages: string; spec: string } | null {
	const singleMatch = llmResponse.match(/```(?:typescript|ts)\s*\n([\s\S]*?)```/);
	if (!singleMatch) return null;

	const code = singleMatch[1] ?? "";
	const hasClass = /export\s+class\s+\w+/.test(code);
	const hasTest = /test\s*\(/.test(code);
	if (hasClass && hasTest) {
		const classEnd = code.lastIndexOf("\nexport class") > -1 ? code.indexOf("\ntest(") : -1;
		if (classEnd > 0) {
			return {
				pages: normalizeImports(code.slice(0, classEnd)),
				spec: normalizeImports(code.slice(classEnd)),
			};
		}
	}
	return { pages: "", spec: normalizeImports(code) };
}

export function extractPOMCode(llmResponse: string): { pages: string; spec: string } {
	const labeled = extractLabeledBlocks(llmResponse);
	if (labeled) return labeled;

	const altLabeled = extractAltLabeledBlocks(llmResponse);
	if (altLabeled) return altLabeled;

	const single = extractSingleBlock(llmResponse);
	if (single) return single;

	throw new Error("LLM response did not contain TypeScript code blocks");
}

function normalizeImports(code: string): string {
	return code
		.replace(/from\s+['"]playwright['"]/g, `from '@playwright/test'`)
		.replace(/from\s+['"]@playwright\/core['"]/g, `from '@playwright/test'`)
		.trim();
}

const DANGEROUS_PATTERNS = [
	/\beval\s*\(/,
	/\brequire\s*\(/,
	/child_process/,
	/\bexec\s*\(/,
	/fs\.\w+Sync/,
	/fs\.promises/,
	/\breadFile\b/,
	/\bwriteFile\b/,
	/\bappendFile\b/,
	/\bunlink\b/,
	/\bimport\s*\(/,
	/\bFunction\s*\(/,
	/process\.exit/,
];

function hasDangerousPatterns(code: string): boolean {
	return DANGEROUS_PATTERNS.some((pattern) => pattern.test(code));
}

export function validateCode(code: string): boolean {
	if (hasDangerousPatterns(code)) return false;
	return code.includes("import") && code.includes("page");
}

const HARDCODED_SECRET_PATTERNS = [
	/(?:password|secret|token|api[_-]?key|credential)\s*=\s*['"`][^'"`]{3,}/i,
	/(?:password|secret|token|api[_-]?key)\s*:\s*['"`][^'"`]{3,}/i,
	/\.fill\s*\(\s*['"`][^'"`]*@[^'"`]*\.[^'"`]*['"`]\s*\)/,
	/\.fill\s*\([^,]+,\s*['"`][^'"`]{8,}['"`]\s*\)/,
];

export function validateSpecCode(code: string): boolean {
	if (hasDangerousPatterns(code)) return false;
	if (HARDCODED_SECRET_PATTERNS.some((p) => p.test(code))) return false;
	return (
		code.includes("import") &&
		code.includes("test(") &&
		code.includes("page") &&
		code.includes("expect")
	);
}

function detectCredentialVars(pages: string, spec: string): string[] {
	const combined = pages + spec;
	const vars: string[] = [];
	if (/BASE_URL|process\.env\.BASE_URL/.test(combined)) vars.push("BASE_URL=https://your-app.com");
	if (/TEST_EMAIL|process\.env\.TEST_EMAIL/.test(combined))
		vars.push("TEST_EMAIL=your-email@example.com");
	if (/TEST_PASSWORD|process\.env\.TEST_PASSWORD/.test(combined))
		vars.push("TEST_PASSWORD=your-password");
	if (/TEST_PHONE|process\.env\.TEST_PHONE/.test(combined)) vars.push("TEST_PHONE=your-phone");
	if (/TEST_USERNAME|process\.env\.TEST_USERNAME/.test(combined))
		vars.push("TEST_USERNAME=your-username");
	return vars;
}

export function sanitizeTestName(name: string): string {
	return (
		name
			.replace(/[^a-z0-9._-]/gi, "-")
			.replace(/-{2,}/g, "-")
			.replace(/^-|-$/g, "")
			.toLowerCase() || "recorded-test"
	);
}

export function testNameFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/^\/|\/$/g, "").replace(/\//g, "-");
		return sanitizeTestName(path);
	} catch {
		return "recorded-test";
	}
}

function ensureDir(filepath: string): void {
	const dir = dirname(filepath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function resolveUniquePath(dir: string, name: string, extension: string): string {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	let filename = `${name}${extension}`;
	let filepath = join(dir, filename);
	let counter = 1;

	while (existsSync(filepath)) {
		filename = `${name}-${counter}${extension}`;
		filepath = join(dir, filename);
		counter++;
	}

	return filepath;
}

function extractAndReplaceURLs(spec: string, startUrl: string): string {
	try {
		const parsed = new URL(startUrl);
		const origin = parsed.origin;
		// Replace hardcoded origin in goto() calls and string literals
		const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const urlPattern = new RegExp(`['"\`]${escaped}([^'"\`]*)['"\`]`, "g");
		return spec.replace(urlPattern, (_match, path) => {
			if (path) {
				return `\`\${BASE_URL}${path}\``;
			}
			return "BASE_URL";
		});
	} catch {
		return spec;
	}
}

export function writeGeneratedFiles(
	outputDir: string,
	testName: string,
	pages: string,
	spec: string,
	startUrl: string,
): GeneratedFiles {
	const result: GeneratedFiles = {
		specPath: "",
		pagePath: null,
		envExamplePath: null,
	};

	let finalSpec = spec;
	let finalPages = pages;

	if (finalPages) {
		finalPages = extractAndReplaceURLs(finalPages, startUrl);

		const pagesDir = join(outputDir, "pages");
		const pagePath = resolveUniquePath(pagesDir, testName, ".page.ts");
		ensureDir(pagePath);
		writeFileSync(pagePath, `${finalPages}\n`, "utf-8");
		result.pagePath = pagePath;

		const safeName = sanitizeTestName(testName);
		const pageImportPath = `./pages/${safeName}.page`;
		if (!finalSpec.includes(pageImportPath)) {
			finalSpec = finalSpec.replace(/from\s+['"]\.\/[^'"]*\.page['"]/g, `from '${pageImportPath}'`);
		}
	}

	finalSpec = extractAndReplaceURLs(finalSpec, startUrl);

	const specPath = resolveUniquePath(outputDir, testName, ".spec.ts");
	ensureDir(specPath);
	writeFileSync(specPath, `${finalSpec}\n`, "utf-8");
	result.specPath = specPath;

	const credVars = detectCredentialVars(pages, spec);
	if (credVars.length > 0) {
		const envExamplePath = join(outputDir, ".env.example");
		if (!existsSync(envExamplePath)) {
			writeFileSync(
				envExamplePath,
				`# Test credentials — copy to .env and fill in real values\n${credVars.join("\n")}\n`,
				"utf-8",
			);
			result.envExamplePath = envExamplePath;
		}
	}

	return result;
}

export function writeTestFile(outputDir: string, name: string, code: string): string {
	const filepath = resolveUniquePath(outputDir, name, ".spec.ts");
	ensureDir(filepath);
	writeFileSync(filepath, `${code}\n`, "utf-8");
	return filepath;
}
