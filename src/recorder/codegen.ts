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
	/\bglobalThis\b/,
	/\bnew\s+Proxy\b/,
	/\bnew\s+WebSocket\b/,
	/\bnavigator\.sendBeacon\b/,
	/\bdocument\.cookie\b/,
	/\blocalStorage\b/,
	/\bsessionStorage\b/,
	/\bfetch\s*\(/,
	/\bspawn\s*\(/,
	/\bfork\s*\(/,
	/\bexecSync\s*\(/,
	/\bspawnSync\s*\(/,
	/\bsetTimeout\s*\(\s*['"`]/,
	/\bsetInterval\s*\(\s*['"`]/,
	/\bwindow\s*\[/,
	/\bglobalThis\s*\[/,
	/\bXMLHttpRequest\b/,
	/\bimportScripts\b/,
	// --- R2 hardening: Node/global escape hatches ---
	/\bglobal\s*(?:\.|\?\.|\[|[),;\]}]|$)/m,
	/\.\s*constructor\b/,
	/\[\s*['"`]constructor/,
	/__proto__/,
	/\bReflect\b/,
	/\bimport\s*\.\s*meta\b/,
	// Unicode / hex escapes can spell identifiers and module names past every check here.
	/\\u[0-9a-fA-F{]/,
	/\\x[0-9a-fA-F]{2}/,
	// --- Playwright APIs that read local files, make arbitrary requests or launch processes ---
	/\bsetInputFiles\b/,
	/\bscreenshot\s*\(\s*\{[^)]*\bpath\b/,
	/\bpdf\s*\(/,
	/\btracing\b/,
	/\bvideo\s*\(/,
	/\bsaveAs\b/,
	/\bstorageState\b/,
	/\baddInitScript\b/,
	/\baddScriptTag\b/,
	/\baddStyleTag\b/,
	/\bexposeFunction\b/,
	/\bexposeBinding\b/,
	/\brouteFromHAR\b/,
	// APIRequestContext: page.request / context.request / playwright.request, the
	// `request` fixture (destructured in the test callback) and direct calls on it.
	/\.\s*request\b/,
	/\brequest\s*(?:\?\.|\.)\s*\w+\s*\(/,
	/\(\s*\{[^}]*\brequest\b[^}]*\}\s*\)\s*=>/,
	/\blaunchOptions\b/,
	/\bexecutablePath\b/,
	/\blaunch(?:Persistent\w*)?\s*\(/,
	/\bconnect(?:OverCDP)?\s*\(/,
	/\btest\s*\.\s*use\s*\(/,
];

/** Only these modules may be imported by generated code. */
const ALLOWED_IMPORT = /^(?:@playwright\/test|\.{1,2}\/[A-Za-z0-9_./-]+)$/;
const IMPORT_SOURCE = /\bfrom\s*(['"`])([^'"`]*)\1|\bimport\s*(['"`])([^'"`]*)\3/g;

function hasDisallowedImports(code: string): boolean {
	for (const m of code.matchAll(IMPORT_SOURCE)) {
		const source = m[2] ?? m[4] ?? "";
		if (!ALLOWED_IMPORT.test(source)) return true;
	}
	return false;
}

/**
 * Generated tests may only read `process.env.BASE_URL` and `process.env.TEST_*`.
 * Any other use of `process` (optional chaining, computed access, the whole env
 * object, other variables such as CI secrets) is rejected.
 */
const ALLOWED_ENV_VAR = /^(?:BASE_URL|TEST_[A-Z0-9_]+)$/;

// `process` used as a value: followed by a member/call/terminator token, or preceded by
// an operator / opening bracket / spread / `return`. Prose such as "// Intent: process
// the payment" or getByText('Checkout process') is not flagged.
const PROCESS_AS_VALUE_AFTER = /^process\s*(?:[.?[),;}\]]|$)/m;
const PROCESS_AS_VALUE_BEFORE = /(?:[=(,[{!&|?+]|\.\.\.|\breturn|\bawait|\btypeof)\s*$/;

function hasDisallowedProcessAccess(code: string): boolean {
	for (const m of code.matchAll(/\bprocess\b/g)) {
		const idx = m.index ?? 0;
		const rest = code.slice(idx);
		const access = rest.match(/^process\.env\.([A-Za-z_$][\w$]*)(?![\w$])/);
		if (access) {
			if (!ALLOWED_ENV_VAR.test(access[1] ?? "")) return true;
			continue;
		}
		if (PROCESS_AS_VALUE_AFTER.test(rest) || PROCESS_AS_VALUE_BEFORE.test(code.slice(0, idx))) {
			return true;
		}
	}
	return false;
}

/**
 * Defense-in-depth only. A regex deny/allow-list over generated source is not a
 * security boundary; generated code must still be reviewed before it is run.
 */
function hasDangerousPatterns(code: string): boolean {
	return (
		DANGEROUS_PATTERNS.some((pattern) => pattern.test(code)) ||
		hasDisallowedImports(code) ||
		hasDisallowedProcessAccess(code)
	);
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
	if (/TEST_API_TOKEN|process\.env\.TEST_API_TOKEN/.test(combined))
		vars.push("TEST_API_TOKEN=your-api-token");
	if (/TEST_SECRET_KEY|process\.env\.TEST_SECRET_KEY/.test(combined))
		vars.push("TEST_SECRET_KEY=your-secret-key");
	if (/TEST_ACCESS_KEY|process\.env\.TEST_ACCESS_KEY/.test(combined))
		vars.push("TEST_ACCESS_KEY=your-access-key");
	if (/TEST_AUTH_TOKEN|process\.env\.TEST_AUTH_TOKEN/.test(combined))
		vars.push("TEST_AUTH_TOKEN=your-auth-token");
	if (/TEST_API_SECRET|process\.env\.TEST_API_SECRET/.test(combined))
		vars.push("TEST_API_SECRET=your-api-secret");
	if (/TEST_CLIENT_SECRET|process\.env\.TEST_CLIENT_SECRET/.test(combined))
		vars.push("TEST_CLIENT_SECRET=your-client-secret");
	if (/TEST_PRIVATE_KEY|process\.env\.TEST_PRIVATE_KEY/.test(combined))
		vars.push("TEST_PRIVATE_KEY=your-private-key");
	return vars;
}

export function sanitizeTestName(name: string): string {
	return (
		name
			.replace(/[^a-z0-9_-]/gi, "-")
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
