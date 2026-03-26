import type { Page } from "@playwright/test";
import { getAssertionDetectorScript } from "./browser-scripts.js";
import type { AssertionSuggestion, RecordedRequest } from "./types.js";

export class AssertionDetector {
	private suggestions: AssertionSuggestion[] = [];
	private onSuggestion: ((suggestion: AssertionSuggestion) => void) | null = null;
	private currentActionCount = 0;
	private cleanupHandlers: Array<() => void> = [];
	private page: Page | null = null;

	setActionCount(count: number): void {
		this.currentActionCount = count;
	}

	async attach(page: Page): Promise<void> {
		this.page = page;

		await page.exposeFunction("__kovar_suggestAssertion", (json: string) => {
			try {
				const suggestion = JSON.parse(json) as AssertionSuggestion;
				suggestion.afterActionIndex = this.currentActionCount;
				this.suggestions.push(suggestion);
				this.onSuggestion?.(suggestion);
			} catch {
				// Ignore malformed suggestion
			}
		});

		await page.exposeFunction("__kovar_acceptAssertion", (id: string) => {
			const suggestion = this.suggestions.find((s) => s.id === id);
			if (suggestion) suggestion.accepted = true;
		});

		await page.exposeFunction("__kovar_dismissAssertion", (id: string) => {
			const idx = this.suggestions.findIndex((s) => s.id === id);
			if (idx !== -1) this.suggestions.splice(idx, 1);
		});

		await page.addInitScript(getAssertionDetectorScript());

		// M3: Cleanup interval on page close / context destroyed
		const cleanupOnClose = async () => {
			try {
				await page.evaluate(() => {
					const win = window as unknown as Record<string, unknown>;
					if (typeof win.__kovar_cleanupAssertionDetector === "function") {
						(win.__kovar_cleanupAssertionDetector as () => void)();
					}
				});
			} catch {
				// Page already closed, interval will be GC'd with the page context
			}
		};

		if (typeof page.on === "function") {
			page.on("close", cleanupOnClose);
			this.cleanupHandlers.push(() => {
				page.removeListener("close", cleanupOnClose);
			});
		}
	}

	async syncActionCount(page: Page): Promise<void> {
		try {
			await page.evaluate((count) => {
				(window as unknown as Record<string, number>).__kovar_actionCount = count;
			}, this.currentActionCount);
		} catch {
			// Page navigating, ignore
		}
	}

	suggestFromNetwork(request: RecordedRequest): void {
		if (request.resourceType !== "fetch" && request.resourceType !== "xhr") return;
		const url = request.url;
		if (!url.includes("/api/") && !url.includes("/graphql")) return;

		const path = (() => {
			try {
				return new URL(url).pathname;
			} catch {
				return url;
			}
		})();

		const shortPath = path.length > 40 ? `...${path.slice(-37)}` : path;

		const suggestion: AssertionSuggestion = {
			id: `net_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
			type: "api_status",
			description: `Assert ${request.method} ${shortPath} returned ${request.responseStatus}`,
			playwrightCode: `// Verify API: ${request.method} ${path} → ${request.responseStatus}`,
			timestamp: Date.now(),
			accepted: false,
			afterActionIndex: this.currentActionCount,
		};

		this.suggestions.push(suggestion);
		this.onSuggestion?.(suggestion);
	}

	setOnSuggestion(callback: (suggestion: AssertionSuggestion) => void): void {
		this.onSuggestion = callback;
	}

	getSuggestions(): AssertionSuggestion[] {
		return this.suggestions;
	}

	getAcceptedAssertions(): AssertionSuggestion[] {
		return this.suggestions.filter((s) => s.accepted);
	}

	getAcceptedCount(): number {
		return this.suggestions.filter((s) => s.accepted).length;
	}

	async destroy(): Promise<void> {
		if (this.page) {
			try {
				await this.page.evaluate(() => {
					const win = window as unknown as Record<string, unknown>;
					if (typeof win.__kovar_cleanupAssertionDetector === "function") {
						(win.__kovar_cleanupAssertionDetector as () => void)();
					}
				});
			} catch {
				// Page already closed or navigating
			}
			this.page = null;
		}
		for (const handler of this.cleanupHandlers) {
			handler();
		}
		this.cleanupHandlers = [];
	}
}
