/**
 * Delta tracker: captures DOM mutations (added/removed text and elements)
 * between user actions to provide context about page state changes.
 */

import { getVisibleText, nodeToSummary } from "./dom-context.js";

export interface MutationBufferData {
	addedText: string[];
	removedText: string[];
	addedElements: Array<{ tagName: string; role: string | null; text: string | null }>;
	removedElements: Array<{ tagName: string; role: string | null; text: string | null }>;
}

export interface DeltaData {
	urlChanged: boolean;
	newUrl: string | null;
	addedText: string[];
	removedText: string[];
	addedElements: Array<{ tagName: string; role: string | null; text: string | null }>;
	removedElements: Array<{ tagName: string; role: string | null; text: string | null }>;
}

/** Maximum entries per category in the mutation buffer. */
const BUFFER_CAP = 10;

/** Create a fresh empty mutation buffer. */
export function createMutationBuffer(): MutationBufferData {
	return {
		addedText: [],
		removedText: [],
		addedElements: [],
		removedElements: [],
	};
}

/** Process a single added node into the buffer. */
function processAddedNode(node: Node, buffer: MutationBufferData): void {
	const text = getVisibleText(node);
	if (text && text.length > 2 && buffer.addedText.length < BUFFER_CAP) {
		buffer.addedText.push(text);
	}
	const summary = nodeToSummary(node);
	if (summary && buffer.addedElements.length < BUFFER_CAP) {
		buffer.addedElements.push(summary);
	}
}

/** Process a single removed node into the buffer. */
function processRemovedNode(node: Node, buffer: MutationBufferData): void {
	const text = getVisibleText(node);
	if (text && text.length > 2 && buffer.removedText.length < BUFFER_CAP) {
		buffer.removedText.push(text);
	}
	const summary = nodeToSummary(node);
	if (summary && buffer.removedElements.length < BUFFER_CAP) {
		buffer.removedElements.push(summary);
	}
}

/**
 * Process a list of MutationRecords and add visible text/element summaries to the buffer.
 * Buffer is capped at 10 entries per category to prevent unbounded growth.
 */
export function processMutations(mutations: MutationRecord[], buffer: MutationBufferData): void {
	for (const m of mutations) {
		for (let j = 0; j < m.addedNodes.length; j++) {
			const added = m.addedNodes[j];
			if (added) processAddedNode(added, buffer);
		}
		for (let k = 0; k < m.removedNodes.length; k++) {
			const removed = m.removedNodes[k];
			if (removed) processRemovedNode(removed, buffer);
		}
	}
}

/**
 * Flush the current mutation buffer and return a delta object.
 * Returns null if there are no meaningful changes.
 */
export function flushDelta(
	buffer: MutationBufferData,
	lastUrl: string,
	currentUrl: string,
): { delta: DeltaData | null; newLastUrl: string; newBuffer: MutationBufferData } {
	const urlChanged = currentUrl !== lastUrl;
	const delta: DeltaData = {
		urlChanged,
		newUrl: urlChanged ? (currentUrl.split("?")[0] ?? currentUrl) : null,
		addedText: buffer.addedText.slice(),
		removedText: buffer.removedText.slice(),
		addedElements: buffer.addedElements.slice(),
		removedElements: buffer.removedElements.slice(),
	};

	const newBuffer = createMutationBuffer();

	const isEmpty =
		!delta.urlChanged &&
		delta.addedText.length === 0 &&
		delta.removedText.length === 0 &&
		delta.addedElements.length === 0 &&
		delta.removedElements.length === 0;

	return { delta: isEmpty ? null : delta, newLastUrl: currentUrl, newBuffer };
}
