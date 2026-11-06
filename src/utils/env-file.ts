import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Keys the CLI will read from ./.env. Anything else (NODE_OPTIONS, PATH,
 * KOVAR_DB_PATH, ...) is ignored: `.env` lives in the working tree, which may be
 * an untrusted checkout, and these variables are inherited by child processes.
 */
const ALLOWED_ENV_KEY = /^(?:ANTHROPIC_API_KEY|OPENAI_API_KEY|BASE_URL|TEST_[A-Z0-9_]+)$/;

export function loadEnvFile(dir: string = process.cwd()): void {
	const envPath = resolve(dir, ".env");
	if (!existsSync(envPath)) return;
	const content = readFileSync(envPath, "utf-8");
	const ignored: string[] = [];
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;
		const key = trimmed
			.slice(0, eqIndex)
			.trim()
			.replace(/^export\s+/, "");
		if (!ALLOWED_ENV_KEY.test(key)) {
			ignored.push(key);
			continue;
		}
		const value = trimmed
			.slice(eqIndex + 1)
			.trim()
			.replace(/^["']|["']$/g, "");
		if (!process.env[key]) process.env[key] = value;
	}
	if (ignored.length > 0) {
		console.warn(
			`[kovar] Ignored ${ignored.length} key(s) in .env not used by kovar: ${ignored.slice(0, 5).join(", ")}${ignored.length > 5 ? ", ..." : ""}`,
		);
	}
}
