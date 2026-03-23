export {
	checkTitleChange,
	checkUrlChange,
	escapeRegex,
	genId,
	processAddedNode,
	processRemovedNode,
} from "./assertion-detection.js";
export type { AssertionSuggestionData, MutationSuggestion } from "./assertion-detection.js";

export {
	createMutationBuffer,
	flushDelta,
	processMutations,
} from "./delta-tracker.js";
export type { DeltaData, MutationBufferData } from "./delta-tracker.js";

export {
	LANDMARK_ROLES,
	LANDMARK_TAGS,
	SKIP_TAGS,
	captureDOMContext,
	captureElement,
	detectIframeContext,
	detectShadowDOM,
	getAriaLabel,
	getLandmark,
	getRole,
	getVisibleText,
	nodeToSummary,
	truncate,
} from "./dom-context.js";
export type {
	AncestorData,
	CapturedElementData,
	DOMContextData,
	FormContextData,
	FormFieldData,
	IframeContextData,
	ShadowDOMData,
	ShadowHostData,
	SiblingData,
} from "./dom-context.js";

export { maskValue, maskValueBrowser } from "./mask-value.js";

export { createSuggestionElement } from "./toolbar-ui.js";
