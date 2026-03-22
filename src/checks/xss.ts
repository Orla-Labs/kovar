import type { APIRequestContext, Dialog, Page } from "@playwright/test";
import { XSS_POLYGLOTS } from "../payloads/index.js";
import type { SecurityFinding, XSSCheckOptions } from "../types/index.js";
import type { PayloadDefinition } from "../types/payloads.js";

const CANARY_PREFIX = "kovar-xss";
const DEFAULT_API_TIMEOUT = 5000;
const DEFAULT_DOM_TIMEOUT = 2000;

interface FormInfo {
	action: string;
	method: string;
	inputs: InputInfo[];
}

interface InputInfo {
	name: string;
	selector: string;
	type: string;
}

export interface XSSScanResult {
	findings: SecurityFinding[];
	payloadsTested: number;
}

const DANGEROUS_RESPONSE_PATTERNS = [
	/<script[\s>]/i,
	/\bon\w+\s*=/i,
	/javascript\s*:/i,
	/<svg[\s/]/i,
	/<img\s[^>]*onerror/i,
	/<iframe[\s/]/i,
	/<details\s[^>]*ontoggle/i,
	/<style[\s>]/i,
	/\$\{[^}]*\}/,
];

export function isReflectedUnescaped(body: string, payload: PayloadDefinition): boolean {
	const escaped = payload.payload.replace(/</g, "&lt;").replace(/>/g, "&gt;");
	const hasUnescaped = body.includes(payload.payload);
	const hasEscapedOnly = body.includes(escaped) && !hasUnescaped;

	if (!hasUnescaped || hasEscapedOnly) return false;

	return DANGEROUS_RESPONSE_PATTERNS.some((pattern) => pattern.test(body));
}

function buildXSSFinding(
	id: string,
	payload: PayloadDefinition,
	inputName: string,
	evidence: string,
): SecurityFinding {
	return {
		id,
		category: "xss",
		severity: "critical",
		payload: payload.payload,
		message: `XSS payload reflected unescaped in response via "${inputName}" field`,
		remediation: `Sanitize and escape user input in "${inputName}" before rendering`,
		evidence,
	};
}

// Browser-side helper: collects input info from a DOM element.
// Defined as a string to be injected into page.evaluate() contexts.
const COLLECT_INPUTS_FN = `
function collectInputs(root) {
	var inputs = [];
	var elements = root.querySelectorAll("input, textarea");
	for (var i = 0; i < elements.length; i++) {
		var el = elements[i];
		var name = el.name || el.id;
		if (!name || el.type === "hidden" || el.type === "submit" || el.type === "button") continue;
		inputs.push({
			name: name,
			selector: el.id ? "#" + CSS.escape(el.id) : '[name="' + CSS.escape(el.name) + '"]',
			type: el.type || "text"
		});
	}
	return inputs;
}
`;

export class XSSScanner {
	private detectedPayloads: Set<string> = new Set();

	constructor(
		private page: Page,
		private request: APIRequestContext,
	) {}

	async scan(options?: XSSCheckOptions): Promise<XSSScanResult> {
		const depth = options?.depth ?? "quick";
		const payloads = this.selectPayloads(depth, options?.skipPayloads);
		const forms = options?.selector
			? await this.getFormBySelector(options.selector)
			: await this.discoverForms();

		if (forms.length === 0) {
			return { findings: [], payloadsTested: 0 };
		}

		const findings: SecurityFinding[] = [];
		for (const form of forms) {
			const formFindings =
				options?.apiFirst !== false
					? await this.testViaAPI(form, payloads, options?.timeout)
					: await this.testViaDOM(form, payloads, options?.timeout);
			findings.push(...formFindings);
		}

		return { findings, payloadsTested: payloads.length * forms.length };
	}

	private selectPayloads(depth: string, skip?: string[]): PayloadDefinition[] {
		const skipSet = new Set(skip);
		const depthOrder = ["quick", "standard", "thorough"];
		const maxDepthIndex = depthOrder.indexOf(depth);
		return XSS_POLYGLOTS.filter(
			(p) => !skipSet.has(p.id) && depthOrder.indexOf(p.depth) <= maxDepthIndex,
		);
	}

	private async discoverForms(): Promise<FormInfo[]> {
		const results = await this.page.evaluate(`
			(function() {
				${COLLECT_INPUTS_FN}
				var results = [];
				var forms = document.querySelectorAll("form");
				for (var i = 0; i < forms.length; i++) {
					var form = forms[i];
					var inputs = collectInputs(form);
					if (inputs.length > 0) {
						results.push({
							action: form.action || window.location.href,
							method: (form.method || "GET").toUpperCase(),
							inputs: inputs
						});
					}
				}
				return results;
			})()
		`);
		return results as FormInfo[];
	}

	private async getFormBySelector(selector: string): Promise<FormInfo[]> {
		const result = await this.page.evaluate(`
			(function() {
				${COLLECT_INPUTS_FN}
				var container = document.querySelector(${JSON.stringify(selector)});
				if (!container) return null;
				var formEl = container.tagName === "FORM" ? container : container.closest("form");
				var target = formEl || container;
				var inputs = collectInputs(target);
				if (inputs.length === 0) return null;
				if (formEl) {
					return {
						action: formEl.action || window.location.href,
						method: (formEl.method || "GET").toUpperCase(),
						inputs: inputs
					};
				}
				return { action: window.location.href, method: "GET", inputs: inputs };
			})()
		`);
		const form = result as FormInfo | null;
		return form ? [form] : [];
	}

	private async testViaAPI(
		form: FormInfo,
		payloads: PayloadDefinition[],
		timeout?: number,
	): Promise<SecurityFinding[]> {
		const findings: SecurityFinding[] = [];
		for (const input of form.inputs) {
			for (const payload of payloads) {
				const finding = await this.testSinglePayloadViaAPI(form, input, payload, timeout);
				if (finding) findings.push(finding);
			}
		}
		return findings;
	}

	private async testSinglePayloadViaAPI(
		form: FormInfo,
		input: InputInfo,
		payload: PayloadDefinition,
		timeout?: number,
	): Promise<SecurityFinding | null> {
		const data: Record<string, string> = {};
		for (const other of form.inputs) {
			data[other.name] = other.name === input.name ? payload.payload : "test";
		}

		try {
			const response =
				form.method === "POST"
					? await this.request.post(form.action, {
							form: data,
							timeout: timeout ?? DEFAULT_API_TIMEOUT,
						})
					: await this.request.get(form.action, {
							params: data,
							timeout: timeout ?? DEFAULT_API_TIMEOUT,
						});

			const body = await response.text();
			if (isReflectedUnescaped(body, payload)) {
				return buildXSSFinding(
					`xss-${payload.id}`,
					payload,
					input.name,
					`Payload "${payload.name}" was reflected unescaped in the response body`,
				);
			}
		} catch {
			// Request failed or timed out
		}

		return null;
	}

	private async testViaDOM(
		form: FormInfo,
		payloads: PayloadDefinition[],
		timeout?: number,
	): Promise<SecurityFinding[]> {
		const findings: SecurityFinding[] = [];
		this.detectedPayloads.clear();

		const dialogHandler = (dialog: Dialog) => {
			const text = dialog.message();
			if (text.startsWith(CANARY_PREFIX)) {
				this.detectedPayloads.add(text);
			}
			dialog.dismiss().catch(() => {});
		};

		this.page.on("dialog", dialogHandler);
		const cleanupTimeout = setTimeout(
			() => this.page.removeListener("dialog", dialogHandler),
			(timeout ?? DEFAULT_DOM_TIMEOUT) * payloads.length * form.inputs.length + 5000,
		);

		try {
			for (const input of form.inputs) {
				for (const payload of payloads) {
					const finding = await this.testSinglePayloadViaDOM(input, payload, timeout);
					if (finding) findings.push(finding);
				}
			}
		} finally {
			clearTimeout(cleanupTimeout);
			this.page.removeListener("dialog", dialogHandler);
		}

		return findings;
	}

	private async testSinglePayloadViaDOM(
		input: InputInfo,
		payload: PayloadDefinition,
		timeout?: number,
	): Promise<SecurityFinding | null> {
		const expectedCanary = `${CANARY_PREFIX}-${payload.id}`;

		try {
			await this.page.fill(input.selector, payload.payload);
			const submitButton = await this.page.$('button[type="submit"], input[type="submit"]');
			if (submitButton) await submitButton.click();
			await this.page.waitForTimeout(timeout ?? DEFAULT_DOM_TIMEOUT);

			if (this.detectedPayloads.has(expectedCanary)) {
				return buildXSSFinding(
					`xss-dom-${payload.id}`,
					payload,
					input.name,
					`Payload "${payload.name}" triggered alert() in the browser`,
				);
			}

			await this.page.goBack().catch(() => {});
		} catch {
			// Payload caused navigation error or timeout
		}

		return null;
	}
}
