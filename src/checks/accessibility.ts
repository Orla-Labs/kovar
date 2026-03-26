import type { Page } from "@playwright/test";
import type { SecurityFinding } from "../types/results.js";

export interface AccessibilityCheckOptions {
	skip?: string[];
	only?: string[];
	includeWarnings?: boolean;
}

interface A11yRule {
	id: string;
	severity: SecurityFinding["severity"];
	cweId?: string;
	check: (ctx: A11yContext) => SecurityFinding[];
}

interface A11yContext {
	imagesWithoutAlt: number;
	inputsWithoutLabels: string[];
	buttonsWithoutName: number;
	hasLang: boolean;
	hasTitle: boolean;
	emptyLinks: number;
	hasMain: boolean;
	headingIssues: string[];
	autoplayMedia: number;
	lowContrastCount: number;
}

async function gatherContext(page: Page): Promise<A11yContext> {
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: browser DOM traversal requires inline logic
	return page.evaluate(() => {
		const imagesWithoutAlt = document.querySelectorAll("img:not([alt])").length;

		const inputs = document.querySelectorAll(
			"input:not([type='hidden']):not([type='submit']):not([type='button'])",
		);
		const inputsWithoutLabels: string[] = [];
		for (let i = 0; i < inputs.length; i++) {
			const el = inputs[i] as HTMLInputElement | undefined;
			if (!el) continue;
			if (el.getAttribute("aria-label")) continue;
			if (el.getAttribute("aria-labelledby")) continue;
			if (el.id && document.querySelector(`label[for="${el.id}"]`)) continue;
			if (el.closest("label")) continue;
			inputsWithoutLabels.push(el.getAttribute("name") || el.getAttribute("type") || "unknown");
		}

		const buttons = document.querySelectorAll("button");
		let buttonsWithoutName = 0;
		for (let i = 0; i < buttons.length; i++) {
			const btn = buttons[i];
			if (!btn) continue;
			if (btn.textContent?.trim()) continue;
			if (btn.getAttribute("aria-label")) continue;
			if (btn.getAttribute("aria-labelledby")) continue;
			if (btn.querySelector("img[alt]")) continue;
			if (btn.getAttribute("title")) continue;
			buttonsWithoutName++;
		}

		const hasLang = document.documentElement.hasAttribute("lang");
		const hasTitle = Boolean(document.title?.trim());

		const links = document.querySelectorAll("a");
		let emptyLinks = 0;
		for (let i = 0; i < links.length; i++) {
			const link = links[i];
			if (!link) continue;
			if (link.textContent?.trim()) continue;
			if (link.getAttribute("aria-label")) continue;
			if (link.getAttribute("aria-labelledby")) continue;
			if (link.querySelector("img[alt]")) continue;
			if (link.getAttribute("title")) continue;
			emptyLinks++;
		}

		const hasMain = document.querySelectorAll("main, [role='main']").length > 0;

		const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
		const headingIssues: string[] = [];
		let prevLevel = 0;
		let foundH1 = false;
		for (let i = 0; i < headings.length; i++) {
			const heading = headings[i];
			if (!heading) continue;
			const level = Number.parseInt(heading.tagName.charAt(1), 10);
			if (level === 1) foundH1 = true;
			if (level > 1 && !foundH1) {
				headingIssues.push(`<${heading.tagName.toLowerCase()}> appears before any <h1>`);
			}
			if (prevLevel > 0 && level > prevLevel + 1) {
				headingIssues.push(`Heading level skipped from <h${prevLevel}> to <h${level}>`);
			}
			prevLevel = level;
		}

		const autoplayMedia = document.querySelectorAll(
			"video[autoplay]:not([muted]), audio[autoplay]:not([muted])",
		).length;

		let lowContrastCount = 0;
		const textElements = document.querySelectorAll(
			"p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6",
		);
		const sampleSize = Math.min(textElements.length, 50);
		for (let i = 0; i < sampleSize; i++) {
			const el = textElements[i];
			if (!el) continue;
			const style = window.getComputedStyle(el);
			if (style.color && style.backgroundColor && style.color === style.backgroundColor) {
				lowContrastCount++;
			}
		}

		return {
			imagesWithoutAlt,
			inputsWithoutLabels,
			buttonsWithoutName,
			hasLang,
			hasTitle,
			emptyLinks,
			hasMain,
			headingIssues,
			autoplayMedia,
			lowContrastCount,
		};
	});
}

const A11Y_RULES: A11yRule[] = [
	{
		id: "a11y-img-alt",
		severity: "medium",
		cweId: "CWE-1114",
		check: (ctx) => {
			if (ctx.imagesWithoutAlt === 0) return [];
			return [
				{
					id: "a11y-img-alt",
					category: "configuration",
					severity: "medium",
					message: `${ctx.imagesWithoutAlt} image(s) missing alt text`,
					remediation:
						'Add descriptive alt attributes to all images, or alt="" for decorative images',
					cweId: "CWE-1114",
				},
			];
		},
	},
	{
		id: "a11y-input-label",
		severity: "high",
		cweId: "CWE-1114",
		check: (ctx) => {
			if (ctx.inputsWithoutLabels.length === 0) return [];
			return [
				{
					id: "a11y-input-label",
					category: "configuration",
					severity: "high",
					message: `${ctx.inputsWithoutLabels.length} form input(s) missing accessible labels: ${ctx.inputsWithoutLabels.join(", ")}`,
					remediation:
						'Associate each input with a <label for="..."> element, or add aria-label/aria-labelledby',
					cweId: "CWE-1114",
				},
			];
		},
	},
	{
		id: "a11y-button-name",
		severity: "high",
		cweId: "CWE-1114",
		check: (ctx) => {
			if (ctx.buttonsWithoutName === 0) return [];
			return [
				{
					id: "a11y-button-name",
					category: "configuration",
					severity: "high",
					message: `${ctx.buttonsWithoutName} button(s) missing accessible name`,
					remediation: "Add text content, aria-label, or aria-labelledby to all buttons",
					cweId: "CWE-1114",
				},
			];
		},
	},
	{
		id: "a11y-document-lang",
		severity: "medium",
		check: (ctx) => {
			if (ctx.hasLang) return [];
			return [
				{
					id: "a11y-document-lang",
					category: "configuration",
					severity: "medium",
					message: "Document is missing a lang attribute on the <html> element",
					remediation: 'Add a lang attribute to the html element: <html lang="en">',
				},
			];
		},
	},
	{
		id: "a11y-page-title",
		severity: "medium",
		check: (ctx) => {
			if (ctx.hasTitle) return [];
			return [
				{
					id: "a11y-page-title",
					category: "configuration",
					severity: "medium",
					message: "Page is missing a <title> element",
					remediation: "Add a descriptive <title> element inside <head>",
				},
			];
		},
	},
	{
		id: "a11y-empty-links",
		severity: "medium",
		check: (ctx) => {
			if (ctx.emptyLinks === 0) return [];
			return [
				{
					id: "a11y-empty-links",
					category: "configuration",
					severity: "medium",
					message: `${ctx.emptyLinks} link(s) have no accessible text`,
					remediation: "Add text content, aria-label, or an image with alt text inside links",
					cweId: "CWE-1114",
				},
			];
		},
	},
	{
		id: "a11y-landmark-main",
		severity: "low",
		check: (ctx) => {
			if (ctx.hasMain) return [];
			return [
				{
					id: "a11y-landmark-main",
					category: "configuration",
					severity: "low",
					message: "Page is missing a <main> landmark region",
					remediation: "Wrap the primary content in a <main> element for screen reader navigation",
				},
			];
		},
	},
	{
		id: "a11y-color-contrast",
		severity: "info",
		check: (ctx) => {
			if (ctx.lowContrastCount === 0) return [];
			return [
				{
					id: "a11y-color-contrast",
					category: "configuration",
					severity: "info",
					message: `${ctx.lowContrastCount} element(s) may have insufficient color contrast`,
					remediation:
						"Ensure text meets WCAG 2.1 AA contrast ratios: 4.5:1 for normal text, 3:1 for large text",
				},
			];
		},
	},
	{
		id: "a11y-heading-order",
		severity: "medium",
		check: (ctx) => {
			if (ctx.headingIssues.length === 0) return [];
			return [
				{
					id: "a11y-heading-order",
					category: "configuration",
					severity: "medium",
					message: `Heading hierarchy issues: ${ctx.headingIssues.join("; ")}`,
					remediation:
						"Use headings in sequential order (h1, then h2, etc.) without skipping levels",
				},
			];
		},
	},
	{
		id: "a11y-autoplay-media",
		severity: "medium",
		check: (ctx) => {
			if (ctx.autoplayMedia === 0) return [];
			return [
				{
					id: "a11y-autoplay-media",
					category: "configuration",
					severity: "medium",
					message: `${ctx.autoplayMedia} media element(s) autoplay without being muted`,
					remediation: "Add the muted attribute to autoplaying media, or remove autoplay",
				},
			];
		},
	},
];

function shouldRun(rule: A11yRule, options?: AccessibilityCheckOptions): boolean {
	if (options?.skip?.includes(rule.id)) return false;
	if (options?.only && !options.only.includes(rule.id)) return false;
	if (!options?.includeWarnings && rule.severity === "info") return false;
	return true;
}

export async function checkAccessibility(
	page: Page,
	options?: AccessibilityCheckOptions,
): Promise<SecurityFinding[]> {
	const ctx = await gatherContext(page);
	const findings: SecurityFinding[] = [];

	for (const rule of A11Y_RULES) {
		if (!shouldRun(rule, options)) continue;
		findings.push(...rule.check(ctx));
	}

	return findings;
}
