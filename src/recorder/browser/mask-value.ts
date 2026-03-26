/**
 * PII masking for user input values.
 * Detects and redacts passwords, credit cards, tokens, emails, phone numbers,
 * API keys, IBANs, OTP codes, SSNs, and sensitive fields based on element attributes.
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
	if (/^(sk-|pk-|key-|ak_|sk_)/i.test(value)) return "[API_KEY]";
	if (/^[A-Za-z0-9_-]{33,}$/.test(value)) return "[API_KEY]";
	if (/\S+@\S+\.\S+/.test(value)) return "[EMAIL]";
	if (type === "tel" && /[\d\s\-\(\)]{7,}/.test(value)) return "[PHONE]";
	if (/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(value)) return "[IBAN]";
	const name = `${elName} ${elPlaceholder}`.toLowerCase();
	if (/otp|2fa|mfa|totp|verify|code/.test(name) && /^\d{6,8}$/.test(value)) return "[OTP]";
	if (/ssn|social/.test(name) && /^\d{3}-\d{2}-\d{4}$/.test(value)) return "[SSN]";
	if (/ssn|social/.test(name) && /^\d{9}$/.test(value)) return "[SSN]";
	if (
		/ssn|social|tax|cpf|cnpj|card|credit|cvv|cvc|expir|secret|token|key|auth|credential|api.?key|access.?token|private/.test(
			name,
		)
	)
		return "[REDACTED]";
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
