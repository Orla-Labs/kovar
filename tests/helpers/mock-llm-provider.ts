import type { LLMProvider, LLMResponse, PromptPayload } from "../../src/recorder/llm/types.js";

export class MockLLMProvider implements LLMProvider {
	name = "mock";

	private responses: LLMResponse[] = [];
	private callIndex = 0;
	private failOnCall: number | null = null;
	private failError: Error = new Error("MockLLMProvider: simulated failure");

	readonly calls: PromptPayload[] = [];

	async generate(payload: PromptPayload): Promise<LLMResponse> {
		this.calls.push(payload);
		const currentCall = this.callIndex++;

		if (this.failOnCall !== null && currentCall === this.failOnCall) {
			throw this.failError;
		}

		const response = this.responses[currentCall];
		if (!response) {
			return {
				testCode: "",
				testName: "mock-test",
				tokensUsed: 0,
			};
		}

		return response;
	}

	enqueueResponse(response: LLMResponse): void {
		this.responses.push(response);
	}

	enqueueResponses(responses: LLMResponse[]): void {
		this.responses.push(...responses);
	}

	setFailOnCall(callIndex: number, error?: Error): void {
		this.failOnCall = callIndex;
		if (error) this.failError = error;
	}

	getCallCount(): number {
		return this.callIndex;
	}

	getCall(index: number): PromptPayload | undefined {
		return this.calls[index];
	}

	reset(): void {
		this.responses = [];
		this.callIndex = 0;
		this.failOnCall = null;
		this.calls.length = 0;
	}
}
