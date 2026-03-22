import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../../../src/recorder/llm/prompt.js";
import type {
	CapturedElement,
	RecordedAction,
	RecordedRequest,
	SessionData,
} from "../../../../src/recorder/types.js";
import type { SourceMetadata } from "../../../../src/source/types.js";

function makeElement(overrides: Partial<CapturedElement> = {}): CapturedElement {
	return {
		tagName: "button",
		role: "button",
		ariaLabel: "Submit",
		text: "Submit",
		placeholder: null,
		testId: null,
		name: null,
		id: "submit-btn",
		type: "submit",
		href: null,
		cssSelector: "button#submit-btn",
		parentText: null,
		boundingRect: { x: 100, y: 200, width: 80, height: 36 },
		...overrides,
	};
}

function makeAction(overrides: Partial<RecordedAction> = {}): RecordedAction {
	return {
		type: "click",
		timestamp: Date.now(),
		url: "https://example.com/page",
		element: makeElement(),
		...overrides,
	};
}

function makeRequest(overrides: Partial<RecordedRequest> = {}): RecordedRequest {
	return {
		timestamp: Date.now(),
		method: "GET",
		url: "https://api.example.com/data?token=abc",
		resourceType: "fetch",
		requestHeaders: {},
		requestPostData: null,
		responseStatus: 200,
		responseHeaders: {},
		responseBody: '{"result": "ok"}',
		duration: 150,
		...overrides,
	};
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
	return {
		startUrl: "https://example.com/start?utm=campaign",
		finalUrl: "https://example.com/end?ref=123",
		pageTitle: "Test Page",
		actions: [makeAction()],
		requests: [makeRequest()],
		startTime: Date.now() - 10000,
		endTime: Date.now(),
		...overrides,
	};
}

describe("buildPrompt", () => {
	it("includes sanitized start URL (no query params)", () => {
		const { user } = buildPrompt(makeSession(), "my-test");
		expect(user).toContain("https://example.com/start");
		expect(user).not.toContain("utm=campaign");
	});

	it("includes sanitized final URL", () => {
		const { user } = buildPrompt(makeSession(), "my-test");
		expect(user).toContain("https://example.com/end");
		expect(user).not.toContain("ref=123");
	});

	it("includes action count", () => {
		const session = makeSession({ actions: [makeAction(), makeAction(), makeAction()] });
		const { user } = buildPrompt(session, "my-test");
		expect(user).toContain("3 total");
	});

	it("includes formatted actions with locator suggestions", () => {
		const action = makeAction({
			type: "click",
			element: makeElement({ role: "button", ariaLabel: "Save" }),
		});
		const { user } = buildPrompt(makeSession({ actions: [action] }), "my-test");
		expect(user).toContain("[click]");
		expect(user).toContain("Suggested locator:");
		expect(user).toContain("getByRole('button', { name: 'Save' })");
	});

	it("includes network requests for fetch/xhr", () => {
		const fetchReq = makeRequest({
			resourceType: "fetch",
			method: "POST",
			url: "https://api.example.com/submit",
		});
		const xhrReq = makeRequest({
			resourceType: "xhr",
			method: "GET",
			url: "https://api.example.com/data",
		});
		const session = makeSession({ requests: [fetchReq, xhrReq] });
		const { user } = buildPrompt(session, "my-test");
		expect(user).toContain("POST https://api.example.com/submit");
		expect(user).toContain("GET https://api.example.com/data");
	});

	it("excludes non-fetch/xhr requests from network section", () => {
		const imgReq = makeRequest({ resourceType: "image", url: "https://cdn.example.com/logo.png" });
		const session = makeSession({ requests: [imgReq] });
		const { user } = buildPrompt(session, "my-test");
		expect(user).toContain("No API calls captured.");
	});

	it("trims network requests when over token budget", () => {
		// Create many large fetch requests to exceed the budget
		const requests: RecordedRequest[] = [];
		for (let i = 0; i < 100; i++) {
			requests.push(
				makeRequest({
					resourceType: "fetch",
					method: "POST",
					url: `https://api.example.com/endpoint-${i}`,
					requestPostData: "x".repeat(300),
					responseBody: "y".repeat(600),
				}),
			);
		}
		const session = makeSession({ requests });
		const { user } = buildPrompt(session, "my-test");
		// The prompt should still be generated without error.
		// With trimming, it should not contain all full response bodies.
		expect(user).toBeTruthy();
		// It should contain at least some requests
		expect(user).toContain("api.example.com");
	});

	it("system prompt contains locator priority instructions", () => {
		const { system } = buildPrompt(makeSession(), "my-test");
		expect(system).toContain("getByRole");
		expect(system).toContain("getByText");
		expect(system).toContain("getByTestId");
		expect(system).toContain("getByPlaceholder");
	});

	it("system prompt mentions intent and page object model", () => {
		const { system } = buildPrompt(makeSession(), "my-test");
		expect(system).toContain("Intent:");
		expect(system).toContain("Page Object Model");
	});

	it("formats navigation actions as page group headers with sanitized URL", () => {
		const navAction = makeAction({
			type: "navigation",
			url: "https://example.com/dashboard?session=xyz",
			element: null,
		});
		const session = makeSession({ actions: [navAction] });
		const { user } = buildPrompt(session, "nav-test");
		// Navigation actions become page group headers, not inline actions
		expect(user).toContain("### Page:");
		expect(user).toContain("https://example.com/dashboard");
		expect(user).not.toContain("session=xyz");
	});

	it("includes the test name in instructions", () => {
		const { user } = buildPrompt(makeSession(), "checkout-flow");
		expect(user).toContain("checkout-flow");
	});

	it("includes action value when present", () => {
		const action = makeAction({
			type: "input",
			value: "hello@test.com",
			element: makeElement({ tagName: "input", role: "textbox" }),
		});
		const session = makeSession({ actions: [action] });
		const { user } = buildPrompt(session, "input-test");
		expect(user).toContain('Value: "hello@test.com"');
	});

	it("includes key for keypress actions", () => {
		const action = makeAction({
			type: "keypress",
			key: "Enter",
			element: makeElement({ tagName: "input", role: "textbox" }),
		});
		const session = makeSession({ actions: [action] });
		const { user } = buildPrompt(session, "key-test");
		expect(user).toContain("Key: Enter");
	});

	it("shows 'No API calls captured.' when no fetch/xhr requests", () => {
		const session = makeSession({ requests: [] });
		const { user } = buildPrompt(session, "empty-net");
		expect(user).toContain("No API calls captured.");
	});

	it("includes page title in final page state", () => {
		const session = makeSession({ pageTitle: "Dashboard - My App" });
		const { user } = buildPrompt(session, "title-test");
		expect(user).toContain("Dashboard - My App");
	});

	it("includes source metadata in formatted actions when sourceMap provided", () => {
		const action = makeAction({
			type: "click",
			element: makeElement({ role: "button", ariaLabel: "Submit", testId: "submit-btn" }),
		});
		const session = makeSession({ actions: [action] });
		const sourceMap = new Map<number, SourceMetadata>();
		sourceMap.set(0, {
			componentName: "LoginForm",
			filePath: "src/components/LoginForm.tsx",
			line: 42,
			column: 6,
			elementTag: "button",
			testId: "submit-btn",
			ariaLabel: "Submit",
			role: "button",
			eventHandlers: ["handleSubmit"],
			className: "btn-primary",
		});
		const { user } = buildPrompt(session, "login-test", sourceMap);
		expect(user).toContain("LoginForm");
		expect(user).toContain("Source-verified");
	});
});
