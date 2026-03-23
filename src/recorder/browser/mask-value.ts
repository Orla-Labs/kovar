/**
 * PII masking for user input values.
 * Detects and redacts passwords, credit cards, tokens, emails, phone numbers,
 * and sensitive fields based on element attributes.
 */
export function maskValue(
	elType: string,
	elName: string,
	elPlaceholder: string,
	value: string,
): string {
	if (!value) return value;
	const type = elType.toLowerCase();
	if (type === "password") return "[PASSWORD]";
	if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(value)) return "[CARD]";
	if (/^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(value)) return "[TOKEN]";
	if (/\S+@\S+\.\S+/.test(value)) return "[EMAIL]";
	if (type === "tel" && /[\d\s\-\(\)]{7,}/.test(value)) return "[PHONE]";
	const name = `${elName} ${elPlaceholder}`.toLowerCase();
	if (/ssn|social|tax|cpf|cnpj|card|credit|cvv|cvc|expir/.test(name)) return "[REDACTED]";
	return value;
}

/**
 * Browser-injectable version of maskValue that reads attributes from an element.
 * This is the function injected into the page context.
 */
export function maskValueBrowser(el: HTMLInputElement, value: string): string {
	return maskValue(
		el.type || "",
		el.getAttribute("name") || "",
		el.getAttribute("placeholder") || "",
		value,
	);
}
