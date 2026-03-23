/**
 * Browser-side assertion detection: monitors DOM mutations, URL changes,
 * and title changes to suggest potential test assertions.
 */

export interface AssertionSuggestionData {
	id: string;
	type: string;
	description: string;
	playwrightCode: string;
	timestamp: number;
	accepted: boolean;
	afterActionIndex: number;
}

/** Generate a unique suggestion ID. */
export function genId(counter: number): string {
	return `a_${counter}_${Date.now()}`;
}

/** Escape special regex characters in a string. */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check for URL changes and return a suggestion if the URL is new.
 * Returns null if no change detected or if the URL was already suggested.
 */
export function checkUrlChange(
	currentUrl: string,
	lastUrl: string,
	lastSuggestedUrl: string,
): {
	suggestion: { type: string; description: string; playwrightCode: string } | null;
	newLastUrl: string;
	newLastSuggestedUrl: string;
} {
	if (currentUrl === lastUrl) {
		return { suggestion: null, newLastUrl: lastUrl, newLastSuggestedUrl: lastSuggestedUrl };
	}
	const newLastUrl = currentUrl;
	if (currentUrl === lastSuggestedUrl) {
		return { suggestion: null, newLastUrl, newLastSuggestedUrl: lastSuggestedUrl };
	}
	const newLastSuggestedUrl = currentUrl;
	try {
		const parsed = new URL(currentUrl);
		const path = parsed.pathname;
		const safePath = path.replace(/\//g, "\\/").replace(/^\\\//, "");
		return {
			suggestion: {
				type: "url",
				description: `Assert navigation to ${path}`,
				playwrightCode: `await expect(page).toHaveURL(/${safePath}/)`,
			},
			newLastUrl,
			newLastSuggestedUrl,
		};
	} catch {
		return { suggestion: null, newLastUrl, newLastSuggestedUrl };
	}
}

/**
 * Check for title changes and return a suggestion if the title is new.
 * Returns null if no change detected or if the title was already suggested.
 */
export function checkTitleChange(
	currentTitle: string,
	lastTitle: string,
	lastSuggestedTitle: string,
): {
	suggestion: { type: string; description: string; playwrightCode: string } | null;
	newLastTitle: string;
	newLastSuggestedTitle: string;
} {
	if (currentTitle === lastTitle || currentTitle.length === 0) {
		return {
			suggestion: null,
			newLastTitle: lastTitle,
			newLastSuggestedTitle: lastSuggestedTitle,
		};
	}
	const newLastTitle = currentTitle;
	if (currentTitle === lastSuggestedTitle) {
		return { suggestion: null, newLastTitle, newLastSuggestedTitle: lastSuggestedTitle };
	}
	const newLastSuggestedTitle = currentTitle;
	const safeTitle = escapeRegex(currentTitle).substring(0, 40);
	return {
		suggestion: {
			type: "title",
			description: `Assert page title is "${currentTitle.substring(0, 50)}"`,
			playwrightCode: `await expect(page).toHaveTitle(/${safeTitle}/)`,
		},
		newLastTitle,
		newLastSuggestedTitle,
	};
}

export interface MutationSuggestion {
	type: string;
	description: string;
	playwrightCode: string;
}

/** Detect dialog/modal elements. */
function detectDialog(role: string | null | undefined, text: string): MutationSuggestion | null {
	if (role !== "dialog" && role !== "alertdialog") return null;
	const dialogTitle = text.length > 60 ? `${text.substring(0, 57)}...` : text;
	return {
		type: "element_visible",
		description: `Assert dialog "${dialogTitle || "dialog"}" is visible`,
		playwrightCode: "await expect(page.getByRole('dialog')).toBeVisible()",
	};
}

/** Detect toast/snackbar/notification elements. */
function detectToast(
	className: string,
	role: string | null | undefined,
	text: string,
	seenTexts: Set<string>,
): MutationSuggestion | null {
	const isToast = /toast|snackbar|notification/i.test(className) || role === "status";
	if (!isToast) return null;
	if (text.length < 4 || text.length > 200 || seenTexts.has(text)) return null;
	seenTexts.add(text);
	const toastText = text.length > 40 ? text.substring(0, 40) : text;
	const safeToast = escapeRegex(toastText);
	return {
		type: "text_visible",
		description: `Assert notification "${toastText}" is visible`,
		playwrightCode: `await expect(page.getByText(/${safeToast}/)).toBeVisible()`,
	};
}

/** Detect significant text content (headings, alerts, status messages, form errors). */
function detectSignificantText(
	el: Element,
	tag: string,
	role: string | null | undefined,
	className: string,
	text: string,
): MutationSuggestion | null {
	const isHeading = /^H[1-3]$/.test(tag);
	const isAlert = role === "alert";
	const isMessage =
		/success|error|warning|welcome|logged|saved|created|deleted|updated|failed|invalid/i.test(text);
	const isFormError =
		(role === "alert" && el.closest?.("form")) || /error|invalid|validation/i.test(className);

	if (!isHeading && !isAlert && !isMessage && !isFormError) return null;

	const shortText = text.length > 60 ? `${text.substring(0, 57)}...` : text;
	const matchText = text.length > 40 ? text.substring(0, 40) : text;
	const escaped = escapeRegex(matchText);
	return {
		type: "text_visible",
		description: `Assert "${shortText}" is visible`,
		playwrightCode: `await expect(page.getByText(/${escaped}/)).toBeVisible()`,
	};
}

/**
 * Process added DOM nodes to detect dialogs, toasts, headings, alerts, and messages
 * that could serve as assertion targets.
 */
export function processAddedNode(el: Element, seenTexts: Set<string>): MutationSuggestion | null {
	if (el.id === "__kovar-toolbar") return null;
	const tag = el.tagName;
	if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return null;

	const text = ((el as HTMLElement).innerText || "").trim();
	const role = el.getAttribute?.("role");
	const className = (el.className as string) || "";

	const dialog = detectDialog(role, text);
	if (dialog) return dialog;

	const toast = detectToast(className, role, text, seenTexts);
	if (toast !== undefined) return toast;

	if (text.length < 4 || text.length > 200) return null;
	if (seenTexts.has(text)) return null;
	seenTexts.add(text);
	if (text.split("\n").length > 5) return null;

	return detectSignificantText(el, tag, role, className, text);
}

/**
 * Process removed DOM nodes to detect loading indicator removal.
 */
export function processRemovedNode(el: Element): MutationSuggestion | null {
	if (el.id === "__kovar-toolbar") return null;
	const rClass = (el.className as string) || "";
	const rRole = el.getAttribute?.("role");
	if (rRole === "progressbar" || /loading|spinner|skeleton/i.test(rClass)) {
		return {
			type: "element_hidden",
			description: "Assert loading indicator is gone",
			playwrightCode: "await expect(page.locator('[role=\"progressbar\"]')).toBeHidden()",
		};
	}
	return null;
}
