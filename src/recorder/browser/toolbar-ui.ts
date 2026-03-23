/**
 * Toolbar UI rendering functions.
 * Creates suggestion items with safe DOM construction (no innerHTML with user data).
 */

/**
 * Create a suggestion DOM element using safe DOM APIs.
 * Avoids innerHTML injection by using textContent for the description.
 */
export function createSuggestionElement(
	doc: Document,
	id: string,
	description: string,
	callbacks: {
		onAccept: (id: string, item: HTMLElement) => void;
		onDismiss: (id: string, item: HTMLElement) => void;
	},
): HTMLElement {
	const item = doc.createElement("div");
	item.className = "suggestion";
	item.setAttribute("data-id", id);

	const descSpan = doc.createElement("span");
	descSpan.className = "desc";
	descSpan.textContent = description;
	item.appendChild(descSpan);

	const actionsSpan = doc.createElement("span");
	actionsSpan.className = "actions";

	const acceptBtn = doc.createElement("button");
	acceptBtn.className = "accept";
	acceptBtn.textContent = "Yes";
	actionsSpan.appendChild(acceptBtn);

	const dismissBtn = doc.createElement("button");
	dismissBtn.className = "dismiss";
	dismissBtn.textContent = "No";
	actionsSpan.appendChild(dismissBtn);

	item.appendChild(actionsSpan);

	acceptBtn.addEventListener("click", (e: Event) => {
		e.stopPropagation();
		callbacks.onAccept(id, item);
	});

	dismissBtn.addEventListener("click", (e: Event) => {
		e.stopPropagation();
		callbacks.onDismiss(id, item);
	});

	return item;
}
