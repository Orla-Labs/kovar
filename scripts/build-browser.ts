/**
 * Build script: bundles browser entry points into standalone IIFE .js files.
 *
 * Uses esbuild (transitive dep of tsup) to bundle each entry point into a
 * self-contained IIFE, then writes the output as standalone .js files in
 * dist/browser/. These are loaded at runtime via fs.readFileSync.
 *
 * Output: dist/browser/{action-capture,assertion-detector,toolbar}.js
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BROWSER_DIR = path.join(ROOT, "src", "recorder", "browser");
const OUT_DIR = path.join(ROOT, "dist", "browser");

interface EntryConfig {
	entryFile: string;
	outputName: string;
}

const entries: EntryConfig[] = [
	{
		entryFile: path.join(BROWSER_DIR, "action-capture.entry.ts"),
		outputName: "action-capture.js",
	},
	{
		entryFile: path.join(BROWSER_DIR, "assertion-detector.entry.ts"),
		outputName: "assertion-detector.js",
	},
	{
		entryFile: path.join(BROWSER_DIR, "toolbar.entry.ts"),
		outputName: "toolbar.js",
	},
];

async function buildEntry(config: EntryConfig): Promise<void> {
	const result = await esbuild.build({
		entryPoints: [config.entryFile],
		bundle: true,
		format: "iife",
		target: "es2017",
		minify: false,
		write: false,
		platform: "browser",
		treeShaking: true,
	});

	const code = result.outputFiles[0]?.text;
	if (!code) {
		throw new Error(`esbuild produced no output for ${config.entryFile}`);
	}

	const outputPath = path.join(OUT_DIR, config.outputName);
	fs.writeFileSync(outputPath, code, "utf-8");
	console.log(`  Generated ${path.relative(ROOT, outputPath)} (${code.length} bytes)`);
}

async function main() {
	fs.mkdirSync(OUT_DIR, { recursive: true });

	console.log("Building browser scripts...");
	for (const entry of entries) {
		await buildEntry(entry);
	}
	console.log("Done.");
}

main().catch((err) => {
	console.error("Browser build failed:", err);
	process.exit(1);
});
