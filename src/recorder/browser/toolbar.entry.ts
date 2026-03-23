/**
 * Browser entry point for the recording toolbar UI.
 * Bundled into an IIFE at build time and injected via page.addInitScript().
 *
 * Imports safe DOM construction from toolbar-ui module; contains shadow DOM
 * creation, button handlers, and suggestion display logic.
 */

import { createSuggestionElement } from "./toolbar-ui.js";

declare const window: Record<string, unknown> & Window;

(function () {
	if (document.getElementById("__kovar-toolbar")) return;

	const host = document.createElement("div");
	host.id = "__kovar-toolbar";
	host.style.cssText =
		"position:fixed;top:0;left:0;width:100%;z-index:2147483647;pointer-events:none;";
	document.documentElement.appendChild(host);

	const shadow = host.attachShadow({ mode: "closed" });
	shadow.innerHTML =
		"<style>" +
		'* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }' +
		".bar { display: flex; align-items: center; gap: 12px; padding: 6px 16px; margin: 8px auto; width: fit-content; " +
		"background: rgba(0,0,0,0.88); color: #fff; border-radius: 8px; font-size: 13px; pointer-events: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }" +
		".dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: pulse 1.5s infinite; }" +
		".dot.paused { background: #f59e0b; animation: none; }" +
		"@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }" +
		".label { font-weight: 600; letter-spacing: 0.5px; }" +
		".stats { color: #a1a1aa; font-size: 12px; }" +
		'.sep { color: #3f3f46; }' +
		"button { background: none; border: 1px solid #52525b; color: #fff; padding: 3px 10px; border-radius: 4px; " +
		"cursor: pointer; font-size: 12px; font-family: inherit; transition: background 0.15s; }" +
		"button:hover { background: rgba(255,255,255,0.1); }" +
		"button.stop { border-color: #ef4444; color: #ef4444; }" +
		"button.stop:hover { background: rgba(239,68,68,0.15); }" +
		// Suggestion panel styles
		".suggestions { display: flex; flex-direction: column; gap: 4px; margin: 4px auto 8px; width: fit-content; max-width: 600px; pointer-events: auto; }" +
		".suggestion { display: flex; align-items: center; gap: 8px; padding: 6px 12px; " +
		"background: rgba(0,0,0,0.92); color: #e4e4e7; border-radius: 6px; font-size: 12px; " +
		"box-shadow: 0 2px 8px rgba(0,0,0,0.25); animation: slideIn 0.2s ease-out; border-left: 3px solid #8b5cf6; }" +
		"@keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }" +
		".suggestion .desc { flex: 1; color: #d4d4d8; }" +
		".suggestion .actions { display: flex; gap: 4px; flex-shrink: 0; }" +
		".suggestion button.accept { border-color: #22c55e; color: #22c55e; padding: 2px 8px; font-size: 11px; }" +
		".suggestion button.accept:hover { background: rgba(34,197,94,0.15); }" +
		".suggestion button.dismiss { border-color: #52525b; color: #71717a; padding: 2px 8px; font-size: 11px; }" +
		".suggestion button.dismiss:hover { background: rgba(255,255,255,0.05); }" +
		".suggestion.accepted { border-left-color: #22c55e; opacity: 0.7; }" +
		".suggestion.accepted .desc { text-decoration: line-through; color: #71717a; }" +
		"@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; transform: translateY(-4px); } }" +
		"</style>" +
		'<div class="bar">' +
		'<span class="dot" id="st-dot"></span>' +
		'<span class="label">Recording</span>' +
		'<span class="sep">|</span>' +
		'<span class="stats" id="st-stats">0 actions \u00b7 0 requests \u00b7 0 assertions</span>' +
		'<button id="st-pause">Pause</button>' +
		'<button class="stop" id="st-stop">Stop</button>' +
		"</div>" +
		'<div class="suggestions" id="st-suggestions"></div>';

	const dot = shadow.getElementById("st-dot");
	const stats = shadow.getElementById("st-stats");
	const pauseBtn = shadow.getElementById("st-pause");
	const stopBtn = shadow.getElementById("st-stop");
	const suggestionsEl = shadow.getElementById("st-suggestions");

	(window as Record<string, unknown>).__kovar_paused = false;
	const MAX_VISIBLE_SUGGESTIONS = 3;
	const AUTO_DISMISS_MS = 15000;

	pauseBtn!.addEventListener("click", function (e: Event) {
		e.stopPropagation();
		(window as Record<string, unknown>).__kovar_paused = !(window as Record<string, unknown>).__kovar_paused;
		pauseBtn!.textContent = (window as Record<string, unknown>).__kovar_paused ? "Resume" : "Pause";
		dot!.className = (window as Record<string, unknown>).__kovar_paused ? "dot paused" : "dot";
	});

	stopBtn!.addEventListener("click", function (e: Event) {
		e.stopPropagation();
		if (typeof (window as Record<string, unknown>).__kovar_stopRecording === "function") {
			((window as Record<string, unknown>).__kovar_stopRecording as () => void)();
		}
	});

	(window as Record<string, unknown>).__kovar_updateToolbar = function (
		actionCount: number,
		requestCount: number,
		assertionCount: number,
	) {
		if (stats)
			stats.textContent =
				actionCount +
				" actions \u00b7 " +
				requestCount +
				" requests \u00b7 " +
				(assertionCount || 0) +
				" assertions";
	};

	(window as Record<string, unknown>).__kovar_showSuggestion = function (
		id: string,
		description: string,
	) {
		if (!suggestionsEl) return;

		// Limit visible suggestions
		while (suggestionsEl.children.length >= MAX_VISIBLE_SUGGESTIONS) {
			suggestionsEl.removeChild(suggestionsEl.firstChild!);
		}

		// Safe DOM construction -- no innerHTML with user-controlled data
		const item = document.createElement("div");
		item.className = "suggestion";
		item.setAttribute("data-id", id);

		const descSpan = document.createElement("span");
		descSpan.className = "desc";
		descSpan.textContent = description;
		item.appendChild(descSpan);

		const actionsSpan = document.createElement("span");
		actionsSpan.className = "actions";

		const acceptBtn = document.createElement("button");
		acceptBtn.className = "accept";
		acceptBtn.textContent = "Yes";
		actionsSpan.appendChild(acceptBtn);

		const dismissBtn = document.createElement("button");
		dismissBtn.className = "dismiss";
		dismissBtn.textContent = "No";
		actionsSpan.appendChild(dismissBtn);

		item.appendChild(actionsSpan);

		acceptBtn.addEventListener("click", function (e: Event) {
			e.stopPropagation();
			item.className = "suggestion accepted";
			if (typeof (window as Record<string, unknown>).__kovar_acceptAssertion === "function") {
				((window as Record<string, unknown>).__kovar_acceptAssertion as (id: string) => void)(id);
			}
			setTimeout(function () {
				if (item.parentElement) {
					item.style.animation = "fadeOut 0.3s ease-out forwards";
					setTimeout(function () {
						if (item.parentElement) item.parentElement.removeChild(item);
					}, 300);
				}
			}, 1000);
		});

		dismissBtn.addEventListener("click", function (e: Event) {
			e.stopPropagation();
			if (typeof (window as Record<string, unknown>).__kovar_dismissAssertion === "function") {
				((window as Record<string, unknown>).__kovar_dismissAssertion as (id: string) => void)(id);
			}
			item.style.animation = "fadeOut 0.2s ease-out forwards";
			setTimeout(function () {
				if (item.parentElement) item.parentElement.removeChild(item);
			}, 200);
		});

		suggestionsEl.appendChild(item);

		// Auto-dismiss after timeout
		setTimeout(function () {
			if (item.parentElement && !item.classList.contains("accepted")) {
				if (typeof (window as Record<string, unknown>).__kovar_dismissAssertion === "function") {
					((window as Record<string, unknown>).__kovar_dismissAssertion as (id: string) => void)(id);
				}
				item.style.animation = "fadeOut 0.3s ease-out forwards";
				setTimeout(function () {
					if (item.parentElement) item.parentElement.removeChild(item);
				}, 300);
			}
		}, AUTO_DISMISS_MS);
	};
})();
