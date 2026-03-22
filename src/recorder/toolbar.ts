import type { Page } from "@playwright/test";

const TOOLBAR_SCRIPT = `
(function() {
	if (document.getElementById('__kovar-toolbar')) return;

	var host = document.createElement('div');
	host.id = '__kovar-toolbar';
	host.style.cssText = 'position:fixed;top:0;left:0;width:100%;z-index:2147483647;pointer-events:none;';
	document.documentElement.appendChild(host);

	var shadow = host.attachShadow({ mode: 'closed' });
	shadow.innerHTML = '<style>' +
		'* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }' +
		'.bar { display: flex; align-items: center; gap: 12px; padding: 6px 16px; margin: 8px auto; width: fit-content; ' +
		'background: rgba(0,0,0,0.88); color: #fff; border-radius: 8px; font-size: 13px; pointer-events: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }' +
		'.dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: pulse 1.5s infinite; }' +
		'.dot.paused { background: #f59e0b; animation: none; }' +
		'@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }' +
		'.label { font-weight: 600; letter-spacing: 0.5px; }' +
		'.stats { color: #a1a1aa; font-size: 12px; }' +
		'.sep { color: #3f3f46; }' +
		'button { background: none; border: 1px solid #52525b; color: #fff; padding: 3px 10px; border-radius: 4px; ' +
		'cursor: pointer; font-size: 12px; font-family: inherit; transition: background 0.15s; }' +
		'button:hover { background: rgba(255,255,255,0.1); }' +
		'button.stop { border-color: #ef4444; color: #ef4444; }' +
		'button.stop:hover { background: rgba(239,68,68,0.15); }' +
	'</style>' +
	'<div class="bar">' +
		'<span class="dot" id="st-dot"></span>' +
		'<span class="label">Recording</span>' +
		'<span class="sep">|</span>' +
		'<span class="stats" id="st-stats">0 actions · 0 requests</span>' +
		'<button id="st-pause">Pause</button>' +
		'<button class="stop" id="st-stop">Stop</button>' +
	'</div>';

	var dot = shadow.getElementById('st-dot');
	var stats = shadow.getElementById('st-stats');
	var pauseBtn = shadow.getElementById('st-pause');
	var stopBtn = shadow.getElementById('st-stop');

	window.__kovar_paused = false;

	pauseBtn.addEventListener('click', function(e) {
		e.stopPropagation();
		window.__kovar_paused = !window.__kovar_paused;
		pauseBtn.textContent = window.__kovar_paused ? 'Resume' : 'Pause';
		dot.className = window.__kovar_paused ? 'dot paused' : 'dot';
	});

	stopBtn.addEventListener('click', function(e) {
		e.stopPropagation();
		if (window.__kovar_stopRecording) {
			window.__kovar_stopRecording();
		}
	});

	window.__kovar_updateToolbar = function(actionCount, requestCount) {
		if (stats) stats.textContent = actionCount + ' actions · ' + requestCount + ' requests';
	};
})();
`;

export class Toolbar {
	async attach(page: Page): Promise<void> {
		await page.addInitScript(TOOLBAR_SCRIPT);
		try {
			await page.evaluate(TOOLBAR_SCRIPT);
		} catch {
			// Page may not be ready yet, addInitScript will handle it
		}

		page.on("load", async () => {
			try {
				await page.evaluate(TOOLBAR_SCRIPT);
			} catch {
				// Page may not be ready
			}
		});
	}

	async updateCounts(page: Page, actions: number, requests: number): Promise<void> {
		try {
			await page.evaluate(
				`window.__kovar_updateToolbar && window.__kovar_updateToolbar(${actions}, ${requests})`,
			);
		} catch {
			// Page navigating, ignore
		}
	}
}
