import { homedir } from "node:os";
import { join } from "node:path";

export function resolveDbPath(): string {
	const override = process.env.KOVAR_DB_PATH;
	if (override && override.length > 0) return override;
	return join(homedir(), ".kovar", "runs.db");
}
