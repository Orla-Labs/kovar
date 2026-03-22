export interface LLMProvider {
	name: string;
	generate(payload: PromptPayload): Promise<LLMResponse>;
}

export interface PromptPayload {
	systemPrompt: string;
	userPrompt: string;
	maxTokens: number;
}

export interface LLMResponse {
	testCode: string;
	testName: string;
	tokensUsed: number;
}
