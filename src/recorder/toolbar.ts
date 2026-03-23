import type { Page } from "@playwright/test";
import { getToolbarScript } from "./browser-scripts.js";
import type { AssertionSuggestion } from "./types.js";

export class Toolbar {
	async attach(page: Page): Promise<void> {
		await page.addInitScript(getToolbarScript());
		try {
			await page.evaluate(getToolbarScript());
		} catch {
			// Page may not be ready yet, addInitScript will handle it
		}

		page.on("load", async () => {
			try {
				await page.evaluate(getToolbarScript());
			} catch {
				// Page may not be ready
			}
		});
	}

	async updateCounts(page: Page, actions: number, requests: number, assertions = 0): Promise<void> {
		try {
			// H1 fix: Use parameterized form instead of string interpolation
			await page.evaluate(
				([a, r, s]) => {
					const win = window as unknown as Record<string, unknown>;
					if (typeof win.__kovar_updateToolbar === "function") {
						(win.__kovar_updateToolbar as (a: number, r: number, s: number) => void)(a, r, s);
					}
				},
				[actions, requests, assertions] as const,
			);
		} catch {
			// Page navigating, ignore
		}
	}

	async showSuggestion(page: Page, suggestion: AssertionSuggestion): Promise<void> {
		try {
			await page.evaluate(
				([id, desc]) => {
					const win = window as unknown as Record<string, unknown>;
					if (typeof win.__kovar_showSuggestion === "function") {
						(win.__kovar_showSuggestion as (id: string, desc: string) => void)(id, desc);
					}
				},
				[suggestion.id, suggestion.description] as const,
			);
		} catch {
			// Page navigating, ignore
		}
	}
}
