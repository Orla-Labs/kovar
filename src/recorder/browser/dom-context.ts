/**
 * DOM context capture functions for extracting semantic information
 * about elements and their surrounding DOM structure.
 */

/** Tags that should be skipped during DOM traversal. */
export const SKIP_TAGS: Record<string, number> = {
	SCRIPT: 1,
	STYLE: 1,
	NOSCRIPT: 1,
	META: 1,
	LINK: 1,
	BR: 1,
	HR: 1,
};

/** ARIA landmark roles. */
export const LANDMARK_ROLES: Record<string, number> = {
	banner: 1,
	navigation: 1,
	main: 1,
	complementary: 1,
	contentinfo: 1,
	form: 1,
	region: 1,
	search: 1,
};

/** Tag-to-landmark role mapping. */
export const LANDMARK_TAGS: Record<string, string> = {
	NAV: "navigation",
	MAIN: "main",
	HEADER: "banner",
	FOOTER: "contentinfo",
	ASIDE: "complementary",
};

/** Truncate a string to a maximum length, appending "..." if truncated. */
export function truncate(str: string | null | undefined, max: number): string | null {
	if (!str) return null;
	const trimmed = str.trim();
	return trimmed.length > max ? `${trimmed.substring(0, max)}...` : trimmed;
}

/**
 * Get the ARIA landmark role for an element, checking both the `role` attribute
 * and the implicit role from the tag name.
 */
export function getLandmark(el: Element): string | null {
	const role = el.getAttribute?.("role");
	if (role && LANDMARK_ROLES[role]) return role;
	if (LANDMARK_TAGS[el.tagName]) return LANDMARK_TAGS[el.tagName] ?? null;
	return null;
}

/**
 * Derive the implicit ARIA role for an element based on its tag and type.
 */
export function getRole(el: Element): string | null {
	const explicit = el.getAttribute("role");
	if (explicit) return explicit;
	const tag = el.tagName.toLowerCase();
	const type = ((el as HTMLInputElement).type || "").toLowerCase();
	if (tag === "button" || (tag === "input" && type === "submit")) return "button";
	if (tag === "a" && (el as HTMLAnchorElement).href) return "link";
	if (tag === "input" && type === "checkbox") return "checkbox";
	if (tag === "input" && type === "radio") return "radio";
	if (
		tag === "input" &&
		(type === "text" ||
			type === "email" ||
			type === "password" ||
			type === "search" ||
			type === "tel" ||
			type === "url" ||
			type === "number")
	)
		return "textbox";
	if (tag === "textarea") return "textbox";
	if (tag === "select") return "combobox";
	if (tag === "img") return "img";
	return null;
}

/**
 * Resolve the accessible name for an element via aria-label, aria-labelledby,
 * associated <label>, or wrapping <label>.
 */
export function getAriaLabel(el: Element, maxTextLength: number): string | null {
	const label = el.getAttribute("aria-label");
	if (label) return label;
	const labelledBy = el.getAttribute("aria-labelledby");
	if (labelledBy) {
		const labelEl = document.getElementById(labelledBy);
		if (labelEl) return truncate(labelEl.textContent, maxTextLength);
	}
	const id = el.id;
	if (id) {
		const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
		if (forLabel) return truncate(forLabel.textContent, maxTextLength);
	}
	const parent = el.closest("label");
	if (parent) return truncate(parent.textContent, maxTextLength);
	return null;
}

/** Extract a summary of a DOM node for mutation tracking. */
export function nodeToSummary(
	node: Node,
): { tagName: string; role: string | null; text: string | null } | null {
	if (node.nodeType !== 1) return null;
	const el = node as Element;
	if (SKIP_TAGS[el.tagName] || el.id === "__kovar-toolbar") return null;
	return {
		tagName: el.tagName.toLowerCase(),
		role: el.getAttribute("role") || null,
		text: truncate((el as HTMLElement).innerText || el.textContent, 60),
	};
}

/** Get visible text from a node, filtering out hidden elements and skip tags. */
export function getVisibleText(node: Node): string {
	if (node.nodeType === 3) return (node.textContent || "").trim();
	if (node.nodeType !== 1) return "";
	const el = node as HTMLElement;
	if (SKIP_TAGS[el.tagName]) return "";
	if (el.id === "__kovar-toolbar") return "";
	const style = window.getComputedStyle(el);
	if (style.display === "none" || style.visibility === "hidden") return "";
	return truncate(el.innerText || el.textContent, 80) || "";
}

export interface ShadowHostData {
	tag: string;
	id?: string;
	className?: string;
	testId?: string;
}

export interface ShadowDOMData {
	shadowHost: ShadowHostData | null;
	shadowDepth: number;
}

export interface IframeContextData {
	frameSelector: string | null;
	frameName: string | null;
	frameUrl: string | null;
}

/** Detect shadow DOM context for an element. */
export function detectShadowDOM(el: Element): ShadowDOMData {
	let shadowHost: Element | null = null;
	let shadowDepth = 0;
	let node: Node | null = el;
	while (node) {
		const root = node.getRootNode();
		if (root instanceof ShadowRoot) {
			shadowDepth++;
			shadowHost = root.host;
			node = shadowHost;
		} else {
			break;
		}
	}
	if (shadowDepth === 0 || !shadowHost) return { shadowHost: null, shadowDepth: 0 };
	return {
		shadowHost: {
			tag: shadowHost.tagName.toLowerCase(),
			id: shadowHost.id || undefined,
			className: (shadowHost as HTMLElement).className || undefined,
			testId: shadowHost.getAttribute("data-testid") || undefined,
		},
		shadowDepth: shadowDepth,
	};
}

/** Detect iframe context for the current window. */
export function detectIframeContext(): IframeContextData {
	if (window === window.top) return { frameSelector: null, frameName: null, frameUrl: null };
	let frameEl: Element | null = null;
	try {
		if (window.frameElement) {
			frameEl = window.frameElement;
		}
	} catch {
		/* cross-origin iframe */
	}
	let frameName: string | null = null;
	let frameSelector: string | null = null;
	let frameUrl: string | null = null;
	if (frameEl) {
		frameName = frameEl.getAttribute("name") || null;
		const frameId = frameEl.id;
		if (frameId) {
			frameSelector = `#${frameId}`;
		} else if (frameName) {
			frameSelector = `iframe[name="${frameName}"]`;
		} else {
			const src = frameEl.getAttribute("src");
			if (src) {
				frameSelector = `iframe[src="${src}"]`;
			} else {
				frameSelector = "iframe";
			}
		}
		frameUrl = frameEl.getAttribute("src") || null;
	} else {
		try {
			frameUrl = window.location.href;
		} catch {
			/* cross-origin */
		}
	}
	return { frameSelector, frameName, frameUrl };
}

export interface CapturedElementData {
	tagName: string;
	role: string | null;
	ariaLabel: string | null;
	text: string | null;
	placeholder: string | null;
	testId: string | null;
	name: string | null;
	id: string | null;
	type: string | null;
	href: string | null;
	cssSelector: string;
	parentText: string | null;
	boundingRect: { x: number; y: number; width: number; height: number };
	siblingIndex: number;
	siblingCount: number;
	parentTagName: string | null;
	parentRole: string | null;
	parentTestId: string | null;
	nearbyHeading: string | null;
	ariaDescribedBy: string | null;
	ariaExpanded: string | null;
	ariaSelected: string | null;
	isDisabled: boolean;
	mightBeDynamic: boolean;
	stableText: string | null;
	kovarFile: string | null;
	kovarLine: string | null;
	kovarCol: string | null;
	shadowHost?: ShadowHostData;
	shadowDepth?: number;
	frameSelector?: string;
	frameName?: string;
	frameUrl?: string;
}

/** Capture all relevant attributes and context from an element. */
export function captureElement(el: Element, maxTextLength: number): CapturedElementData {
	const rect = el.getBoundingClientRect();
	const htmlEl = el as HTMLInputElement;
	const anchorEl = el as HTMLAnchorElement;

	const describedById = el.getAttribute("aria-describedby");
	let ariaDescribedBy: string | null = null;
	if (describedById) {
		const descEl = document.getElementById(describedById);
		ariaDescribedBy = descEl ? truncate(descEl.textContent, 60) : null;
	}

	const shadow = detectShadowDOM(el);
	const iframe = detectIframeContext();

	const result: CapturedElementData = {
		tagName: el.tagName.toLowerCase(),
		role: getRole(el),
		ariaLabel: getAriaLabel(el, maxTextLength),
		text: truncate((el as HTMLElement).innerText || el.textContent, maxTextLength),
		placeholder: el.getAttribute("placeholder"),
		testId: el.getAttribute("data-testid"),
		name: el.getAttribute("name"),
		id: el.id || null,
		type: htmlEl.type || null,
		href: anchorEl.href || null,
		cssSelector: el.id
			? `#${CSS.escape(el.id)}`
			: el.getAttribute("name")
				? `[name="${CSS.escape(el.getAttribute("name") || "")}"]`
				: el.tagName.toLowerCase(),
		parentText: el.parentElement ? truncate(el.parentElement.textContent, maxTextLength) : null,
		boundingRect: {
			x: Math.round(rect.x),
			y: Math.round(rect.y),
			width: Math.round(rect.width),
			height: Math.round(rect.height),
		},
		siblingIndex: Array.from(el.parentElement ? el.parentElement.children : []).indexOf(el),
		siblingCount: el.parentElement ? el.parentElement.children.length : 0,
		parentTagName: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
		parentRole: el.parentElement ? el.parentElement.getAttribute("role") : null,
		parentTestId: el.parentElement ? el.parentElement.getAttribute("data-testid") : null,
		nearbyHeading: (() => {
			const section = el.closest(
				'section, [role="region"], [role="dialog"], [role="main"], article',
			);
			if (!section) return null;
			const h = section.querySelector("h1, h2, h3, h4");
			return h ? truncate(h.textContent, 60) : null;
		})(),
		ariaDescribedBy,
		ariaExpanded: el.hasAttribute("aria-expanded") ? el.getAttribute("aria-expanded") : null,
		ariaSelected: el.hasAttribute("aria-selected") ? el.getAttribute("aria-selected") : null,
		isDisabled:
			htmlEl.disabled || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
		mightBeDynamic: /^\d+\s+|^\$[\d,.]+|^\d{1,2}\/\d{1,2}|today|yesterday|ago$/i.test(
			((el as HTMLElement).innerText || "").trim(),
		),
		stableText: (() => {
			const t = ((el as HTMLElement).innerText || el.textContent || "").trim();
			return t.replace(/^\d+\s+/, "").substring(0, 100) || null;
		})(),
		kovarFile: el.getAttribute("data-kovar-file"),
		kovarLine: el.getAttribute("data-kovar-line"),
		kovarCol: el.getAttribute("data-kovar-col"),
	};

	if (shadow.shadowHost) {
		result.shadowHost = shadow.shadowHost;
		result.shadowDepth = shadow.shadowDepth;
	}
	if (iframe.frameSelector) {
		result.frameSelector = iframe.frameSelector;
	}
	if (iframe.frameName) {
		result.frameName = iframe.frameName;
	}
	if (iframe.frameUrl) {
		result.frameUrl = iframe.frameUrl;
	}

	return result;
}

export interface AncestorData {
	tagName: string;
	role: string | null;
	ariaLabel: string | null;
	text: string | null;
	testId: string | null;
	landmark: string | null;
}

export interface SiblingData {
	tagName: string;
	role: string | null;
	text: string | null;
	index: number;
	isCurrent: boolean;
}

export interface FormFieldData {
	tagName: string;
	type: string | null;
	name: string | null;
	role: string | null;
	ariaLabel: string | null;
	placeholder: string | null;
}

export interface FormContextData {
	action: string | null;
	method: string;
	fieldCount: number;
	fields: FormFieldData[];
}

export interface DOMContextData {
	ancestors: AncestorData[];
	siblings: SiblingData[];
	formContext: FormContextData | null;
	landmark: string | null;
}

/** Collect the ancestor chain up to maxAncestors levels. */
function collectAncestors(el: Element, maxAncestors: number): AncestorData[] {
	const ancestors: AncestorData[] = [];
	let current = el.parentElement;
	while (current && current !== document.documentElement && ancestors.length < maxAncestors) {
		ancestors.push({
			tagName: current.tagName.toLowerCase(),
			role: current.getAttribute("role") || null,
			ariaLabel: current.getAttribute("aria-label") || null,
			text: truncate(current.childNodes.length <= 3 ? current.textContent || "" : "", 60),
			testId: current.getAttribute("data-testid") || null,
			landmark: getLandmark(current),
		});
		current = current.parentElement;
	}
	return ancestors;
}

/** Collect sibling elements up to maxSiblings. */
function collectSiblings(el: Element, maxSiblings: number): SiblingData[] {
	const siblings: SiblingData[] = [];
	const parent = el.parentElement;
	if (!parent) return siblings;
	const children = parent.children;
	const count = Math.min(children.length, maxSiblings);
	for (let i = 0; i < count; i++) {
		const sib = children[i];
		if (!sib) continue;
		siblings.push({
			tagName: sib.tagName.toLowerCase(),
			role: getRole(sib),
			text: truncate((sib as HTMLElement).innerText || sib.textContent, 40),
			index: i,
			isCurrent: sib === el,
		});
	}
	return siblings;
}

/** Collect form context if the element is inside a form. */
function collectFormContext(
	el: Element,
	maxFormFields: number,
	maxTextLength: number,
): FormContextData | null {
	const form = el.closest("form");
	if (!form) return null;
	const formFields: FormFieldData[] = [];
	const inputs = form.querySelectorAll('input, select, textarea, button[type="submit"]');
	const fieldCount = inputs.length;
	for (let f = 0; f < Math.min(fieldCount, maxFormFields); f++) {
		const field = inputs[f] as HTMLInputElement;
		if (!field) continue;
		formFields.push({
			tagName: field.tagName.toLowerCase(),
			type: field.type || null,
			name: field.getAttribute("name") || null,
			role: getRole(field),
			ariaLabel: getAriaLabel(field, maxTextLength),
			placeholder: field.getAttribute("placeholder") || null,
		});
	}
	return {
		action: form.getAttribute("action") || null,
		method: (form.getAttribute("method") || "get").toLowerCase(),
		fieldCount,
		fields: formFields,
	};
}

/** Walk up the DOM tree to find the nearest landmark ancestor. */
function findNearestLandmark(el: Element): string | null {
	let current: Element | null = el;
	while (current && current !== document.documentElement) {
		const lm = getLandmark(current);
		if (lm) return lm;
		current = current.parentElement;
	}
	return null;
}

/**
 * Capture the full DOM context surrounding an element: ancestor chain,
 * siblings, form context, and nearest landmark.
 */
export function captureDOMContext(
	el: Element,
	maxAncestors: number,
	maxSiblings: number,
	maxFormFields: number,
	maxTextLength: number,
): DOMContextData {
	return {
		ancestors: collectAncestors(el, maxAncestors),
		siblings: collectSiblings(el, maxSiblings),
		formContext: collectFormContext(el, maxFormFields, maxTextLength),
		landmark: findNearestLandmark(el),
	};
}
