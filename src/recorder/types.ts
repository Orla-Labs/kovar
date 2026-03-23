export interface CapturedElement {
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
	siblingIndex?: number;
	siblingCount?: number;
	parentTagName?: string;
	parentRole?: string;
	parentTestId?: string;
	nearbyHeading?: string;
	ariaDescribedBy?: string | null;
	ariaExpanded?: string | null;
	ariaSelected?: string | null;
	isDisabled?: boolean;
	mightBeDynamic?: boolean;
	stableText?: string;
	kovarFile?: string | null;
	kovarLine?: string | null;
	kovarCol?: string | null;

	// Shadow DOM context
	shadowHost?: {
		tag: string;
		id?: string;
		className?: string;
		testId?: string;
	};
	shadowDepth?: number; // How many shadow roots deep (0 = light DOM)

	// Iframe context
	frameSelector?: string; // CSS selector for the iframe containing this element
	frameName?: string; // iframe name attribute
	frameUrl?: string; // iframe src URL
}

// ── Rich Snapshot Types ──

export interface AncestorNode {
	tagName: string;
	role: string | null;
	ariaLabel: string | null;
	text: string | null;
	testId: string | null;
	landmark: string | null;
}

export interface SiblingNode {
	tagName: string;
	role: string | null;
	text: string | null;
	index: number;
	isCurrent: boolean;
}

export interface FormField {
	tagName: string;
	type: string | null;
	name: string | null;
	role: string | null;
	ariaLabel: string | null;
	placeholder: string | null;
}

export interface FormContext {
	action: string | null;
	method: string | null;
	fieldCount: number;
	fields: FormField[];
}

export interface DOMContext {
	ancestors: AncestorNode[];
	siblings: SiblingNode[];
	formContext: FormContext | null;
	landmark: string | null;
}

export interface DeltaElement {
	tagName: string;
	role: string | null;
	text: string | null;
}

export interface PageDelta {
	urlChanged: boolean;
	newUrl: string | null;
	addedText: string[];
	removedText: string[];
	addedElements: DeltaElement[];
	removedElements: DeltaElement[];
}

// ── Assertion Suggestion Types ──

export type AssertionType =
	| "url"
	| "text_visible"
	| "text_hidden"
	| "element_visible"
	| "element_hidden"
	| "api_status"
	| "title";

export interface AssertionSuggestion {
	id: string;
	type: AssertionType;
	description: string;
	playwrightCode: string;
	timestamp: number;
	accepted: boolean;
	afterActionIndex: number;
}

// ── Action & Session Types ──

export type ActionType =
	| "click"
	| "input"
	| "change"
	| "submit"
	| "keypress"
	| "navigation"
	| "select";

export interface RecordedAction {
	actionId?: number;
	type: ActionType;
	timestamp: number;
	url: string;
	element: CapturedElement | null;
	value?: string;
	key?: string;
	modifiers?: string[];
	domContext?: DOMContext;
	delta?: PageDelta;
}

export interface RecordedRequest {
	timestamp: number;
	method: string;
	url: string;
	resourceType: string;
	requestHeaders: Record<string, string>;
	requestPostData: string | null;
	responseStatus: number;
	responseHeaders: Record<string, string>;
	responseBody: string | null;
	duration: number;
}

export interface SessionData {
	startUrl: string;
	finalUrl: string;
	pageTitle: string;
	actions: RecordedAction[];
	requests: RecordedRequest[];
	assertions: AssertionSuggestion[];
	startTime: number;
	endTime: number;
}

export interface RecorderConfig {
	url: string;
	outputDir: string;
	testName?: string;
	provider?: "anthropic" | "openai";
	model?: string;
	captureNetwork?: boolean;
	maskPasswords?: boolean;
	maxActions?: number;
	/** Maximum recording duration in milliseconds. Defaults to 30 minutes. */
	maxDuration?: number;
	/** Path to the source directory for codebase-aware locator generation. */
	sourceDir?: string;
	/** Enable self-healing: run generated test and auto-fix failures. Defaults to false. */
	heal?: boolean;
	/** Max self-healing attempts. Defaults to 3. */
	healAttempts?: number;
}
