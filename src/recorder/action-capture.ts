import type { Page } from "@playwright/test";
import { getActionCaptureScript } from "./browser-scripts.js";
import type { RecordedAction } from "./types.js";

/** Navigation dedup window in milliseconds. */
const NAV_DEDUP_WINDOW = 1000;

export class ActionCapture {
	private actions: RecordedAction[] = [];
	private maxActions: number;
	private lastActivityTime: number;

	constructor(maxActions = 200) {
		this.maxActions = maxActions;
		this.lastActivityTime = Date.now();
	}

	async attach(page: Page): Promise<void> {
		await page.exposeFunction("__kovar_recordAction", (json: string) => {
			if (this.actions.length >= this.maxActions) return;
			try {
				const action = JSON.parse(json) as RecordedAction;
				this.actions.push(action);
				this.lastActivityTime = Date.now();
			} catch {
				// Ignore malformed JSON from browser-side script
			}
		});

		await page.exposeFunction("__kovar_attachDelta", (json: string) => {
			try {
				const payload = JSON.parse(json) as {
					actionId: number;
					delta: RecordedAction["delta"];
				};
				const target = this.actions.find((a) => a.actionId === payload.actionId);
				if (!target || !payload.delta) return;

				if (target.delta) {
					const existing = target.delta;
					existing.addedText.push(...payload.delta.addedText);
					existing.removedText.push(...payload.delta.removedText);
					existing.addedElements.push(...payload.delta.addedElements);
					existing.removedElements.push(...payload.delta.removedElements);
					if (payload.delta.urlChanged) {
						existing.urlChanged = true;
						existing.newUrl = payload.delta.newUrl;
					}
				} else {
					target.delta = payload.delta;
				}
			} catch {
				// Ignore malformed delta
			}
		});

		await page.addInitScript(getActionCaptureScript());

		// Inject capture script into existing child frames (iframes)
		for (const frame of page.frames()) {
			if (frame !== page.mainFrame()) {
				frame.evaluate(getActionCaptureScript()).catch(() => {
					// Ignore errors for cross-origin iframes
				});
			}
		}

		page.on("framenavigated", (frame) => {
			if (frame === page.mainFrame()) {
				const url = frame.url();
				const now = Date.now();

				const lastAction =
					this.actions.length > 0 ? this.actions[this.actions.length - 1] : undefined;
				if (
					lastAction &&
					lastAction.type === "navigation" &&
					lastAction.url === url &&
					now - lastAction.timestamp < NAV_DEDUP_WINDOW
				) {
					return;
				}

				this.actions.push({
					type: "navigation",
					timestamp: now,
					url,
					element: null,
				});
				this.lastActivityTime = now;
			} else {
				frame.evaluate(getActionCaptureScript()).catch(() => {});
			}
		});
	}

	getActions(): RecordedAction[] {
		return this.actions;
	}

	getActionCount(): number {
		return this.actions.length;
	}

	getLastActivityTime(): number {
		return this.lastActivityTime;
	}
}
