import type { Page } from "@playwright/test";
import type { RecordedAction } from "./types.js";

const ACTION_CAPTURE_SCRIPT = `
(function() {
	if (window.__kovar_capturing) return;
	window.__kovar_capturing = true;

	var CLICK_DEBOUNCE = 50;
	var INPUT_DEBOUNCE = 300;
	var MAX_TEXT_LENGTH = 100;
	var lastClickTime = 0;
	var inputTimers = {};

	function safeUrl() {
		try {
			var u = new URL(window.location.href);
			return u.origin + u.pathname;
		} catch(e) {
			return window.location.href.split('?')[0];
		}
	}

	function truncate(str, max) {
		if (!str) return null;
		str = str.trim();
		return str.length > max ? str.substring(0, max) + '...' : str;
	}

	function maskValue(el, value) {
		if (!value) return value;
		var type = (el.type || '').toLowerCase();
		if (type === 'password') return '[PASSWORD]';
		if (/\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b/.test(value)) return '[CARD]';
		if (/^eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}/.test(value)) return '[TOKEN]';
		if (/\\S+@\\S+\\.\\S+/.test(value)) return '[EMAIL]';
		if (type === 'tel' && /[\\d\\s\\-\\(\\)]{7,}/.test(value)) return '[PHONE]';
		var name = ((el.getAttribute('name') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
		if (/ssn|social|tax|cpf|cnpj|card|credit|cvv|cvc|expir/.test(name)) return '[REDACTED]';
		return value;
	}

	function getRole(el) {
		var explicit = el.getAttribute('role');
		if (explicit) return explicit;
		var tag = el.tagName.toLowerCase();
		var type = (el.type || '').toLowerCase();
		if (tag === 'button' || (tag === 'input' && type === 'submit')) return 'button';
		if (tag === 'a' && el.href) return 'link';
		if (tag === 'input' && type === 'checkbox') return 'checkbox';
		if (tag === 'input' && type === 'radio') return 'radio';
		if (tag === 'input' && (type === 'text' || type === 'email' || type === 'password' || type === 'search' || type === 'tel' || type === 'url' || type === 'number')) return 'textbox';
		if (tag === 'textarea') return 'textbox';
		if (tag === 'select') return 'combobox';
		if (tag === 'img') return 'img';
		return null;
	}

	function getAriaLabel(el) {
		var label = el.getAttribute('aria-label');
		if (label) return label;
		var labelledBy = el.getAttribute('aria-labelledby');
		if (labelledBy) {
			var labelEl = document.getElementById(labelledBy);
			if (labelEl) return truncate(labelEl.textContent, MAX_TEXT_LENGTH);
		}
		var id = el.id;
		if (id) {
			var forLabel = document.querySelector('label[for="' + CSS.escape(id) + '"]');
			if (forLabel) return truncate(forLabel.textContent, MAX_TEXT_LENGTH);
		}
		var parent = el.closest('label');
		if (parent) return truncate(parent.textContent, MAX_TEXT_LENGTH);
		return null;
	}

	function captureElement(el) {
		var rect = el.getBoundingClientRect();
		return {
			tagName: el.tagName.toLowerCase(),
			role: getRole(el),
			ariaLabel: getAriaLabel(el),
			text: truncate(el.innerText || el.textContent, MAX_TEXT_LENGTH),
			placeholder: el.getAttribute('placeholder'),
			testId: el.getAttribute('data-testid'),
			name: el.getAttribute('name'),
			id: el.id || null,
			type: el.type || null,
			href: el.href || null,
			cssSelector: el.id ? '#' + CSS.escape(el.id) : (el.name ? '[name="' + CSS.escape(el.name) + '"]' : el.tagName.toLowerCase()),
			parentText: el.parentElement ? truncate(el.parentElement.textContent, MAX_TEXT_LENGTH) : null,
			boundingRect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },

			siblingIndex: Array.from(el.parentElement ? el.parentElement.children : []).indexOf(el),
			siblingCount: el.parentElement ? el.parentElement.children.length : 0,

			parentTagName: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
			parentRole: el.parentElement ? el.parentElement.getAttribute('role') : null,
			parentTestId: el.parentElement ? el.parentElement.getAttribute('data-testid') : null,

			nearbyHeading: (function() {
				var section = el.closest('section, [role="region"], [role="dialog"], [role="main"], article');
				if (!section) return null;
				var h = section.querySelector('h1, h2, h3, h4');
				return h ? truncate(h.textContent, 60) : null;
			})(),

			ariaDescribedBy: el.getAttribute('aria-describedby') ? truncate(document.getElementById(el.getAttribute('aria-describedby'))?.textContent, 60) : null,
			ariaExpanded: el.hasAttribute('aria-expanded') ? el.getAttribute('aria-expanded') : null,
			ariaSelected: el.hasAttribute('aria-selected') ? el.getAttribute('aria-selected') : null,
			isDisabled: el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',

			mightBeDynamic: /^\d+\s+|^\$[\d,.]+|^\d{1,2}\/\d{1,2}|today|yesterday|ago$/i.test((el.innerText || '').trim()),

			stableText: (function() {
				var t = (el.innerText || el.textContent || '').trim();
				return t.replace(/^\d+\s+/, '').substring(0, 100) || null;
			})(),
			kovarFile: el.getAttribute('data-kovar-file'),
			kovarLine: el.getAttribute('data-kovar-line'),
			kovarCol: el.getAttribute('data-kovar-col')
		};
	}

	function emit(action) {
		if (window.__kovar_paused) return;
		if (window.__kovar_recordAction) {
			window.__kovar_recordAction(JSON.stringify(action));
		}
	}

	document.addEventListener('click', function(e) {
		var now = Date.now();
		if (now - lastClickTime < CLICK_DEBOUNCE) return;
		lastClickTime = now;

		var el = e.target;
		if (el.closest && el.closest('#__kovar-toolbar')) return;

		emit({
			type: 'click',
			timestamp: now,
			url: safeUrl(),
			element: captureElement(el),
			value: undefined,
			key: undefined,
			modifiers: undefined
		});
	}, true);

	document.addEventListener('input', function(e) {
		var el = e.target;
		if (el.closest && el.closest('#__kovar-toolbar')) return;

		var key = el.id || el.name || (el.tagName + '_' + Array.from(el.parentElement.children).indexOf(el));
		if (inputTimers[key]) clearTimeout(inputTimers[key]);

		inputTimers[key] = setTimeout(function() {
			var value = maskValue(el, el.value);

			emit({
				type: 'input',
				timestamp: Date.now(),
				url: safeUrl(),
				element: captureElement(el),
				value: value,
				key: undefined,
				modifiers: undefined
			});
		}, INPUT_DEBOUNCE);
	}, true);

	document.addEventListener('change', function(e) {
		var el = e.target;
		if (el.closest && el.closest('#__kovar-toolbar')) return;
		if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password' || el.type === 'email' || el.type === 'search')) return;

		var value = el.value;
		if (el.type === 'checkbox' || el.type === 'radio') {
			value = el.checked ? 'checked' : 'unchecked';
		}

		emit({
			type: 'change',
			timestamp: Date.now(),
			url: safeUrl(),
			element: captureElement(el),
			value: value,
			key: undefined,
			modifiers: undefined
		});
	}, true);

	document.addEventListener('keydown', function(e) {
		if (e.key !== 'Enter' && e.key !== 'Tab' && e.key !== 'Escape') return;
		var el = e.target;
		if (el.closest && el.closest('#__kovar-toolbar')) return;

		var modifiers = [];
		if (e.ctrlKey) modifiers.push('Ctrl');
		if (e.shiftKey) modifiers.push('Shift');
		if (e.altKey) modifiers.push('Alt');
		if (e.metaKey) modifiers.push('Meta');

		emit({
			type: 'keypress',
			timestamp: Date.now(),
			url: safeUrl(),
			element: captureElement(el),
			value: undefined,
			key: e.key,
			modifiers: modifiers.length > 0 ? modifiers : undefined
		});
	}, true);

	// Monitor SPA navigation
	var origPushState = history.pushState;
	var origReplaceState = history.replaceState;
	history.pushState = function() {
		origPushState.apply(this, arguments);
		emit({ type: 'navigation', timestamp: Date.now(), url: safeUrl(), element: null });
	};
	history.replaceState = function() {
		origReplaceState.apply(this, arguments);
		emit({ type: 'navigation', timestamp: Date.now(), url: safeUrl(), element: null });
	};
	window.addEventListener('popstate', function() {
		emit({ type: 'navigation', timestamp: Date.now(), url: safeUrl(), element: null });
	});
})();
`;

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

		await page.addInitScript(ACTION_CAPTURE_SCRIPT);

		page.on("framenavigated", (frame) => {
			if (frame !== page.mainFrame()) return;
			this.actions.push({
				type: "navigation",
				timestamp: Date.now(),
				url: frame.url(),
				element: null,
			});
			this.lastActivityTime = Date.now();
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
