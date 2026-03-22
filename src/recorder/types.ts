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
}

export type ActionType =
	| "click"
	| "input"
	| "change"
	| "submit"
	| "keypress"
	| "navigation"
	| "select";

export interface RecordedAction {
	type: ActionType;
	timestamp: number;
	url: string;
	element: CapturedElement | null;
	value?: string;
	key?: string;
	modifiers?: string[];
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
}
