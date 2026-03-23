import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadScript(name: string): string {
	return readFileSync(resolve(__dirname, "browser", `${name}.js`), "utf-8");
}

let actionCaptureScript: string | undefined;
let assertionDetectorScript: string | undefined;
let toolbarScript: string | undefined;

export function getActionCaptureScript(): string {
	actionCaptureScript ??= loadScript("action-capture");
	return actionCaptureScript;
}

export function getAssertionDetectorScript(): string {
	assertionDetectorScript ??= loadScript("assertion-detector");
	return assertionDetectorScript;
}

export function getToolbarScript(): string {
	toolbarScript ??= loadScript("toolbar");
	return toolbarScript;
}
