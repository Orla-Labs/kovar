import type { APIRequestContext, Dialog, Page } from "@playwright/test";
import { XSS_POLYGLOTS } from "../payloads/index.js";
import type { SecurityFinding, XSSCheckOptions } from "../types/index.js";
import type { PayloadDefinition } from "../types/payloads.js";

const CANARY_PREFIX = "kovar-xss";
const DEFAULT_API_TIMEOUT = 5000;
const DEFAULT_DOM_TIMEOUT = 3000;

async function runWithConcurrency<T>(
	tasks: (() => Promise<T>)[],
	concurrency: number,
): Promise<T[]> {
	const results: T[] = [];
	let index = 0;
	async function runNext(): Promise<void> {
		while (index < tasks.length) {
			const i = index++;
			const task = tasks[i];
			if (task) results[i] = await task();
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, runNext));
	return results;
}

interface FormInfo {
	action: string;
	method: string;
	inputs: InputInfo[];
	/** Hidden fields (CSRF tokens, ids) submitted with their current values. */
	hidden?: Record<string, string>;
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

function lastIndexOfCI(haystack: string, needle: string, before: number): number {
	return haystack.toLowerCase().lastIndexOf(needle, before);
}

/**
 * Whether the reflection at `index` is in a context where a payload with no
 * '<' can still execute: inside a tag (attribute breakout, javascript: URL)
 * or inside a <script> element (string / template-literal breakout). A
 * reflection in a plain text node is inert unless it opens new markup.
 */
function isExecutableContext(body: string, index: number): boolean {
	const scriptOpen = lastIndexOfCI(body, "<script", index);
	if (scriptOpen !== -1 && lastIndexOfCI(body, "</script", index) < scriptOpen) return true;

	const before = body.slice(0, index);
	const tagOpen = before.search(/<[a-zA-Z][^<>]*$/);
	return tagOpen !== -1;
}

export function isReflectedUnescaped(body: string, payload: PayloadDefinition): boolean {
	const needle = payload.payload;
	if (!needle || !body.includes(needle)) return false;

	// A verbatim reflection of a payload that opens markup is an HTML injection.
	if (needle.includes("<")) return true;

	for (let i = body.indexOf(needle); i !== -1; i = body.indexOf(needle, i + 1)) {
		if (isExecutableContext(body, i)) return true;
	}
	return false;
}

function isHtmlResponse(contentType: string | undefined): boolean {
	if (!contentType) return true;
	return /html|xml/i.test(contentType);
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
function collectHidden(root) {
	var hidden = {};
	var elements = root.querySelectorAll('input[type="hidden"]');
	for (var i = 0; i < elements.length; i++) {
		if (elements[i].name) hidden[elements[i].name] = elements[i].value;
	}
	return hidden;
}
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
	private failedRequests = 0;

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
			return {
				findings: [
					{
						id: "xss-no-forms",
						category: "xss",
						severity: "high",
						message:
							"XSS check could not run: no form inputs found on the page, so nothing was tested",
						remediation:
							"Ensure the page has loaded and contains forms, or use the selector option to target a specific container",
					},
				],
				payloadsTested: 0,
			};
		}

		const delay = options?.delayBetweenPayloads ?? 0;
		const concurrency = options?.concurrency ?? 1;
		const findings: SecurityFinding[] = [];
		this.failedRequests = 0;
		for (const form of forms) {
			const formFindings =
				options?.apiFirst !== false
					? await this.testViaAPI(form, payloads, options?.timeout, delay, concurrency)
					: await this.testViaDOM(form, payloads, options?.timeout, delay);
			findings.push(...formFindings);
		}

		const attempted = payloads.length * forms.reduce((n, f) => n + f.inputs.length, 0);
		if (attempted > 0 && this.failedRequests >= attempted) {
			findings.push({
				id: "xss-check-error",
				category: "xss",
				severity: "high",
				message: `XSS check could not run: all ${attempted} payload submissions failed (see [kovar] warnings)`,
				remediation:
					"Make sure the form target is reachable from the test. Nothing was tested, so this is not a pass.",
			});
		}

		return {
			findings,
			payloadsTested: payloads.length * forms.length - Math.min(this.failedRequests, attempted),
		};
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
							inputs: inputs,
							hidden: collectHidden(form)
						});
					}
				}
				return results;
			})()
		`);
		if (!Array.isArray(results)) return [];
		return (results as FormInfo[]).filter(
			(f) => typeof f.action === "string" && Array.isArray(f.inputs),
		);
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
						inputs: inputs,
						hidden: collectHidden(formEl)
					};
				}
				return { action: window.location.href, method: "GET", inputs: inputs };
			})()
		`);
		const form = result as FormInfo | null;
		if (form && (typeof form.action !== "string" || !Array.isArray(form.inputs))) return [];
		return form ? [form] : [];
	}

	private async testViaAPI(
		form: FormInfo,
		payloads: PayloadDefinition[],
		timeout?: number,
		delayBetweenPayloads = 0,
		concurrency = 1,
	): Promise<SecurityFinding[]> {
		if (concurrency <= 1) {
			const findings: SecurityFinding[] = [];
			for (const input of form.inputs) {
				for (const payload of payloads) {
					const finding = await this.testSinglePayloadViaAPI(form, input, payload, timeout);
					if (finding) findings.push(finding);
					if (delayBetweenPayloads > 0) {
						await new Promise((resolve) => setTimeout(resolve, delayBetweenPayloads));
					}
				}
			}
			return findings;
		}

		const tasks: (() => Promise<SecurityFinding | null>)[] = [];
		for (const input of form.inputs) {
			for (const payload of payloads) {
				tasks.push(async () => {
					const finding = await this.testSinglePayloadViaAPI(form, input, payload, timeout);
					if (delayBetweenPayloads > 0) {
						await new Promise((resolve) => setTimeout(resolve, delayBetweenPayloads));
					}
					return finding;
				});
			}
		}

		const results = await runWithConcurrency(tasks, concurrency);
		return results.filter((f): f is SecurityFinding => f !== null);
	}

	private async testSinglePayloadViaAPI(
		form: FormInfo,
		input: InputInfo,
		payload: PayloadDefinition,
		timeout?: number,
	): Promise<SecurityFinding | null> {
		const data: Record<string, string> = { ...(form.hidden ?? {}) };
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

			// Error and validation pages (400/422/500) that echo input are a classic
			// XSS vector, so the body is inspected regardless of status.
			if (!isHtmlResponse(response.headers()["content-type"])) return null;

			const body = await response.text();
			if (isReflectedUnescaped(body, payload)) {
				return buildXSSFinding(
					`xss-${payload.id}`,
					payload,
					input.name,
					`Payload "${payload.name}" was reflected unescaped in the response body`,
				);
			}
		} catch (error: unknown) {
			this.failedRequests++;
			console.warn(
				`[kovar] XSS payload request failed for ${form.action}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		return null;
	}

	private async testViaDOM(
		form: FormInfo,
		payloads: PayloadDefinition[],
		timeout?: number,
		delayBetweenPayloads = 0,
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

		try {
			for (const input of form.inputs) {
				for (const payload of payloads) {
					const finding = await this.testSinglePayloadViaDOM(input, payload, timeout);
					if (finding) findings.push(finding);
					if (delayBetweenPayloads > 0) {
						await new Promise((resolve) => setTimeout(resolve, delayBetweenPayloads));
					}
				}
			}
		} finally {
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
		const waitTime = timeout ?? DEFAULT_DOM_TIMEOUT;

		const savedUrl = this.page.url();
		try {
			await this.page.fill(input.selector, payload.payload, { timeout: waitTime });
			// Submit the input's own form the way a user would (fires submit
			// handlers, works with <button> lacking type=submit); fall back to Enter.
			const submitted = await this.page
				.locator(input.selector)
				.first()
				.evaluate((el) => {
					const form = (el as HTMLInputElement).form;
					if (!form) return false;
					form.requestSubmit();
					return true;
				});
			if (!submitted) await this.page.press(input.selector, "Enter", { timeout: waitTime });

			await Promise.race([
				this.page.waitForEvent("dialog", { timeout: waitTime }).catch(() => {}),
				new Promise((resolve) => setTimeout(resolve, waitTime)),
			]);

			if (this.detectedPayloads.has(expectedCanary)) {
				return buildXSSFinding(
					`xss-dom-${payload.id}`,
					payload,
					input.name,
					`Payload "${payload.name}" triggered alert() in the browser`,
				);
			}
		} catch (error: unknown) {
			this.failedRequests++;
			console.warn(
				`[kovar] XSS DOM payload failed for ${input.name}: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			// Always reload the original page: goBack() after an in-page (SPA)
			// submission left the page under test and every later payload failed.
			await this.page.goto(savedUrl).catch(() => {});
		}

		return null;
	}
}
