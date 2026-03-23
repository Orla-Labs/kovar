import { describe, expect, it } from "vitest";

/**
 * Tests for browser-side DOM context capture functions from ACTION_CAPTURE_SCRIPT.
 *
 * Since DOMParser is not available in Node.js, we use mock DOM objects that
 * implement the minimal interface needed by the extracted functions.
 */

// ── Minimal mock DOM helpers ──

interface MockElement {
	nodeType: number;
	tagName: string;
	id: string;
	textContent: string | null;
	innerText: string;
	type?: string;
	href?: string;
	parentElement: MockElement | null;
	children: MockElement[];
	childNodes: Array<{ nodeType: number; textContent?: string | null }>;
	_attributes: Record<string, string>;
	getAttribute(name: string): string | null;
	closest(selector: string): MockElement | null;
	querySelector(selector: string): MockElement | null;
	querySelectorAll(selector: string): MockElement[];
	getBoundingClientRect(): { x: number; y: number; width: number; height: number };
}

function createElement(
	tag: string,
	options: {
		id?: string;
		text?: string;
		type?: string;
		href?: string;
		attrs?: Record<string, string>;
		children?: MockElement[];
	} = {},
): MockElement {
	const attrs = { ...options.attrs };
	if (options.id) attrs.id = options.id;

	const children = options.children ?? [];
	const el: MockElement = {
		nodeType: 1,
		tagName: tag.toUpperCase(),
		id: options.id || "",
		textContent: options.text ?? "",
		innerText: options.text ?? "",
		type: options.type,
		href: options.href,
		parentElement: null,
		children,
		childNodes: [],
		_attributes: attrs,
		getAttribute(name: string) {
			if (name === "id") return el.id || null;
			return attrs[name] ?? null;
		},
		closest(selector: string) {
			// Simple closest implementation
			let current: MockElement | null = el;
			while (current) {
				if (matchesSelector(current, selector)) return current;
				current = current.parentElement;
			}
			return null;
		},
		querySelector(selector: string) {
			return findInChildren(el, selector);
		},
		querySelectorAll(selector: string) {
			return findAllInChildren(el, selector);
		},
		getBoundingClientRect() {
			return { x: 0, y: 0, width: 100, height: 40 };
		},
	};

	// Set parent references and childNodes
	for (const child of children) {
		child.parentElement = el;
	}
	el.childNodes = children.map((c) => ({ nodeType: c.nodeType, textContent: c.textContent }));

	return el;
}

function matchesSelector(el: MockElement, selector: string): boolean {
	if (selector.startsWith("#")) {
		return el.id === selector.slice(1);
	}
	if (selector.startsWith("[")) {
		// Handle [name="..."] and label[for="..."]
		const attrMatch = selector.match(/\[(\w+)="([^"]+)"\]/);
		if (attrMatch) {
			return el.getAttribute(attrMatch[1]!) === attrMatch[2];
		}
	}
	if (selector.includes("[")) {
		// Handle tag[attr="value"]
		const parts = selector.match(/^(\w+)\[(\w+)="([^"]+)"\]/);
		if (parts) {
			return el.tagName.toLowerCase() === parts[1] && el.getAttribute(parts[2]!) === parts[3];
		}
	}
	// Tag selector
	const tags = selector.split(",").map((s) => s.trim().toUpperCase());
	return tags.includes(el.tagName);
}

function findInChildren(el: MockElement, selector: string): MockElement | null {
	for (const child of el.children) {
		if (matchesSelector(child, selector)) return child;
		const found = findInChildren(child, selector);
		if (found) return found;
	}
	return null;
}

function findAllInChildren(el: MockElement, selector: string): MockElement[] {
	const results: MockElement[] = [];
	for (const child of el.children) {
		if (matchesSelector(child, selector)) results.push(child);
		results.push(...findAllInChildren(child, selector));
	}
	return results;
}

// ── Extracted functions from ACTION_CAPTURE_SCRIPT ──

const MAX_TEXT_LENGTH = 100;
const MAX_ANCESTORS = 5;
const MAX_SIBLINGS = 8;
const MAX_FORM_FIELDS = 15;

const LANDMARK_ROLES: Record<string, number> = {
	banner: 1,
	navigation: 1,
	main: 1,
	complementary: 1,
	contentinfo: 1,
	form: 1,
	region: 1,
	search: 1,
};
const LANDMARK_TAGS: Record<string, string> = {
	NAV: "navigation",
	MAIN: "main",
	HEADER: "banner",
	FOOTER: "contentinfo",
	ASIDE: "complementary",
};

function truncate(input: string | null, max: number): string | null {
	if (!input) return null;
	const trimmed = input.trim();
	return trimmed.length > max ? `${trimmed.substring(0, max)}...` : trimmed;
}

function getRole(el: MockElement): string | null {
	const explicit = el.getAttribute("role");
	if (explicit) return explicit;
	const tag = el.tagName.toLowerCase();
	const type = (el.type || "").toLowerCase();
	if (tag === "button" || (tag === "input" && type === "submit")) return "button";
	if (tag === "a" && el.href) return "link";
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

function getAriaLabel(el: MockElement, root: MockElement): string | null {
	const label = el.getAttribute("aria-label");
	if (label) return label;
	const labelledBy = el.getAttribute("aria-labelledby");
	if (labelledBy) {
		const labelEl =
			findInChildren(root, `#${labelledBy}`) ?? (root.id === labelledBy ? root : null);
		if (labelEl) return truncate(labelEl.textContent, MAX_TEXT_LENGTH);
	}
	const id = el.id;
	if (id) {
		const forLabel = findInChildren(root, `label[for="${id}"]`);
		if (forLabel) return truncate(forLabel.textContent, MAX_TEXT_LENGTH);
	}
	const parent = el.closest("label");
	if (parent) return truncate(parent.textContent, MAX_TEXT_LENGTH);
	return null;
}

function getLandmark(el: MockElement): string | null {
	const role = el.getAttribute("role");
	if (role && LANDMARK_ROLES[role]) return role;
	if (LANDMARK_TAGS[el.tagName]) return LANDMARK_TAGS[el.tagName]!;
	return null;
}

function captureDOMContext(el: MockElement, documentElement: MockElement) {
	const ancestors: Array<{
		tagName: string;
		role: string | null;
		ariaLabel: string | null;
		text: string | null;
		testId: string | null;
		landmark: string | null;
	}> = [];
	let current = el.parentElement;
	while (current && current !== documentElement && ancestors.length < MAX_ANCESTORS) {
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

	const siblings: Array<{
		tagName: string;
		role: string | null;
		text: string | null;
		index: number;
		isCurrent: boolean;
	}> = [];
	const parent = el.parentElement;
	if (parent) {
		const count = Math.min(parent.children.length, MAX_SIBLINGS);
		for (let i = 0; i < count; i++) {
			const sib = parent.children[i]!;
			siblings.push({
				tagName: sib.tagName.toLowerCase(),
				role: getRole(sib),
				text: truncate(sib.innerText || sib.textContent, 40),
				index: i,
				isCurrent: sib === el,
			});
		}
	}

	let formContext = null;
	const form = el.closest("form");
	if (form) {
		const formFields: Array<{
			tagName: string;
			type: string | null;
			name: string | null;
			role: string | null;
			ariaLabel: string | null;
			placeholder: string | null;
		}> = [];
		const inputs = form.querySelectorAll("input,select,textarea");
		// Also find submit buttons
		const submitBtns = form
			.querySelectorAll("button")
			.filter((b) => b.getAttribute("type") === "submit" || b.type === "submit");
		const allInputs = [...inputs, ...submitBtns];
		const fieldCount = allInputs.length;
		for (let f = 0; f < Math.min(fieldCount, MAX_FORM_FIELDS); f++) {
			const field = allInputs[f]!;
			formFields.push({
				tagName: field.tagName.toLowerCase(),
				type: field.type || null,
				name: field.getAttribute("name") || null,
				role: getRole(field),
				ariaLabel: getAriaLabel(field, form),
				placeholder: field.getAttribute("placeholder") || null,
			});
		}
		formContext = {
			action: form.getAttribute("action") || null,
			method: (form.getAttribute("method") || "get").toLowerCase(),
			fieldCount,
			fields: formFields,
		};
	}

	let landmark = null;
	let landmarkEl: MockElement | null = el;
	while (landmarkEl && landmarkEl !== documentElement) {
		const lm = getLandmark(landmarkEl);
		if (lm) {
			landmark = lm;
			break;
		}
		landmarkEl = landmarkEl.parentElement;
	}

	return { ancestors, siblings, formContext, landmark };
}

function captureElement(el: MockElement, root: MockElement) {
	return {
		tagName: el.tagName.toLowerCase(),
		role: getRole(el),
		ariaLabel: getAriaLabel(el, root),
		text: truncate(el.innerText || el.textContent, MAX_TEXT_LENGTH),
		id: el.id || null,
	};
}

// ── Helper to build trees ──

function buildTree(
	rootTag: string,
	rootOptions: Parameters<typeof createElement>[1],
): { root: MockElement; documentElement: MockElement } {
	const root = createElement(rootTag, rootOptions);
	// Use root as documentElement stand-in
	const documentElement = createElement("html", { children: [root] });
	root.parentElement = documentElement;
	return { root, documentElement };
}

describe("DOM Context Capture (browser-side functions)", () => {
	describe("captureDOMContext", () => {
		it("returns ancestors up to MAX_ANCESTORS (5)", () => {
			// Build 7 levels deep: html > l1 > l2 > l3 > l4 > l5 > l6 > target
			const target = createElement("button", { id: "target", text: "Click" });
			const l6 = createElement("div", { id: "l6", children: [target] });
			const l5 = createElement("div", { id: "l5", children: [l6] });
			const l4 = createElement("div", { id: "l4", children: [l5] });
			const l3 = createElement("div", { id: "l3", children: [l4] });
			const l2 = createElement("div", { id: "l2", children: [l3] });
			const l1 = createElement("div", { id: "l1", children: [l2] });
			const html = createElement("html", { children: [l1] });
			l1.parentElement = html;

			const ctx = captureDOMContext(target, html);
			expect(ctx.ancestors.length).toBe(5);
		});

		it("returns siblings up to MAX_SIBLINGS (8) with correct isCurrent flag", () => {
			const children: MockElement[] = [];
			let target: MockElement | null = null;
			for (let i = 0; i < 10; i++) {
				const child = createElement("span", { text: `${i + 1}` });
				if (i === 2) target = child;
				children.push(child);
			}
			const parent = createElement("div", { children });
			const html = createElement("html", { children: [parent] });
			parent.parentElement = html;

			const ctx = captureDOMContext(target!, html);
			expect(ctx.siblings.length).toBe(8); // MAX_SIBLINGS cap
			const current = ctx.siblings.find((s) => s.isCurrent);
			expect(current).toBeDefined();
			expect(current?.index).toBe(2);
		});

		it("returns form context with fields when element is inside a form", () => {
			const emailInput = createElement("input", {
				type: "email",
				attrs: { name: "email", placeholder: "Email" },
			});
			const passInput = createElement("input", {
				type: "password",
				attrs: { name: "pass" },
			});
			const submitBtn = createElement("button", {
				id: "target",
				text: "Login",
				type: "submit",
				attrs: { type: "submit" },
			});
			const form = createElement("form", {
				attrs: { action: "/login", method: "post" },
				children: [emailInput, passInput, submitBtn],
			});
			const html = createElement("html", { children: [form] });
			form.parentElement = html;

			const ctx = captureDOMContext(submitBtn, html);
			expect(ctx.formContext).not.toBeNull();
			expect(ctx.formContext?.action).toBe("/login");
			expect(ctx.formContext?.method).toBe("post");
			expect(ctx.formContext?.fieldCount).toBe(3);
			expect(ctx.formContext?.fields).toHaveLength(3);
		});

		it("returns null formContext when not in a form", () => {
			const btn = createElement("button", { id: "target", text: "Click" });
			const div = createElement("div", { children: [btn] });
			const html = createElement("html", { children: [div] });
			div.parentElement = html;

			const ctx = captureDOMContext(btn, html);
			expect(ctx.formContext).toBeNull();
		});

		it("returns landmark from nearest landmark ancestor", () => {
			const link = createElement("a", { id: "target", text: "Home", href: "/" });
			const li = createElement("li", { children: [link] });
			const ul = createElement("ul", { children: [li] });
			const nav = createElement("nav", { children: [ul] });
			const html = createElement("html", { children: [nav] });
			nav.parentElement = html;

			const ctx = captureDOMContext(link, html);
			expect(ctx.landmark).toBe("navigation");
		});
	});

	describe("captureElement", () => {
		it("captures tag, id, role, ariaLabel", () => {
			const btn = createElement("button", {
				id: "submit-btn",
				text: "Submit",
				attrs: { "aria-label": "Submit form", role: "button" },
			});
			const root = createElement("div", { children: [btn] });

			const captured = captureElement(btn, root);
			expect(captured.tagName).toBe("button");
			expect(captured.id).toBe("submit-btn");
			expect(captured.role).toBe("button");
			expect(captured.ariaLabel).toBe("Submit form");
		});

		it("truncates long text values", () => {
			const longText = "A".repeat(200);
			const p = createElement("p", { id: "target", text: longText });
			const root = createElement("div", { children: [p] });

			const captured = captureElement(p, root);
			// MAX_TEXT_LENGTH is 100 + "..."
			expect(captured.text!.length).toBeLessThanOrEqual(103);
			expect(captured.text!.endsWith("...")).toBe(true);
		});
	});

	describe("getRole", () => {
		it("returns explicit ARIA role when present", () => {
			const el = createElement("div", { attrs: { role: "tab" } });
			expect(getRole(el)).toBe("tab");
		});

		it("infers implicit role for button", () => {
			const el = createElement("button", {});
			expect(getRole(el)).toBe("button");
		});

		it("infers implicit role for link (a[href])", () => {
			const el = createElement("a", { href: "https://example.com" });
			expect(getRole(el)).toBe("link");
		});

		it("infers implicit role for checkbox", () => {
			const el = createElement("input", { type: "checkbox" });
			expect(getRole(el)).toBe("checkbox");
		});

		it("infers implicit role for radio", () => {
			const el = createElement("input", { type: "radio" });
			expect(getRole(el)).toBe("radio");
		});

		it("infers implicit role for textbox (input[type=text])", () => {
			const el = createElement("input", { type: "text" });
			expect(getRole(el)).toBe("textbox");
		});

		it("infers implicit role for combobox (select)", () => {
			const el = createElement("select", {});
			expect(getRole(el)).toBe("combobox");
		});

		it("infers implicit role for img", () => {
			const el = createElement("img", {});
			expect(getRole(el)).toBe("img");
		});
	});

	describe("getAriaLabel", () => {
		it("resolves aria-label attribute", () => {
			const el = createElement("button", { attrs: { "aria-label": "Close dialog" } });
			const root = createElement("div", { children: [el] });
			expect(getAriaLabel(el, root)).toBe("Close dialog");
		});

		it("resolves aria-labelledby reference", () => {
			const labelSpan = createElement("span", { id: "label-text", text: "Username" });
			const input = createElement("input", { attrs: { "aria-labelledby": "label-text" } });
			const root = createElement("div", { children: [labelSpan, input] });
			expect(getAriaLabel(input, root)).toBe("Username");
		});

		it("resolves label[for] association", () => {
			const label = createElement("label", {
				text: "Email Address",
				attrs: { for: "email-input" },
			});
			const input = createElement("input", { id: "email-input" });
			const root = createElement("div", { children: [label, input] });
			expect(getAriaLabel(input, root)).toBe("Email Address");
		});

		it("resolves parent label element", () => {
			const input = createElement("input", { type: "password" });
			const label = createElement("label", { text: "Password", children: [input] });
			const root = createElement("div", { children: [label] });
			expect(getAriaLabel(input, root)).toContain("Password");
		});
	});

	describe("getLandmark", () => {
		it("finds nearest landmark role (navigation, main, banner, etc.)", () => {
			const el = createElement("div", { attrs: { role: "navigation" } });
			expect(getLandmark(el)).toBe("navigation");
		});

		it("finds landmark from semantic HTML (nav)", () => {
			const el = createElement("nav", {});
			expect(getLandmark(el)).toBe("navigation");
		});

		it("finds landmark from semantic HTML (main)", () => {
			const el = createElement("main", {});
			expect(getLandmark(el)).toBe("main");
		});

		it("finds landmark from semantic HTML (header -> banner)", () => {
			const el = createElement("header", {});
			expect(getLandmark(el)).toBe("banner");
		});

		it("finds landmark from semantic HTML (footer -> contentinfo)", () => {
			const el = createElement("footer", {});
			expect(getLandmark(el)).toBe("contentinfo");
		});

		it("finds landmark from semantic HTML (aside -> complementary)", () => {
			const el = createElement("aside", {});
			expect(getLandmark(el)).toBe("complementary");
		});
	});
});
