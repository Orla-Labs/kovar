const eventInputSchema = {
	type: "object",
	properties: {
		tool_name: { type: "string" },
		args: { type: "object", additionalProperties: true },
		result: {},
		cost_usd: { type: "number", minimum: 0 },
		tokens_in: { type: "integer", minimum: 0 },
		tokens_out: { type: "integer", minimum: 0 },
		timestamp: { type: "integer" },
	},
	required: ["tool_name", "timestamp"],
	additionalProperties: false,
} as const;

const messageInputSchema = {
	type: "object",
	properties: {
		role: { type: "string" },
		content: { type: "string" },
		tokens: { type: "integer", minimum: 0 },
		timestamp: { type: "integer" },
	},
	required: ["role", "content", "timestamp"],
	additionalProperties: false,
} as const;

export const recordRunSchema = {
	type: "object",
	properties: {
		agent_id: { type: "string" },
		run_id: { type: "string" },
		metadata: { type: "object", additionalProperties: true },
		events: { type: "array", items: eventInputSchema },
		messages: { type: "array", items: messageInputSchema },
		status: { type: "string", enum: ["running", "completed", "failed"] },
	},
	required: ["agent_id", "run_id"],
	additionalProperties: false,
} as const;

export const appendEventsSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		events: { type: "array", items: eventInputSchema },
		messages: { type: "array", items: messageInputSchema },
		status: { type: "string", enum: ["running", "completed", "failed"] },
	},
	required: ["run_id", "events"],
	additionalProperties: false,
} as const;

export const assertToolCalledSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		tool_name: { type: "string" },
		args: { type: "object", additionalProperties: true },
		count: { type: "integer", minimum: 0 },
	},
	required: ["run_id", "tool_name"],
	additionalProperties: false,
} as const;

export const assertNoDriftSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		canonical_name: { type: "string" },
	},
	required: ["run_id", "canonical_name"],
	additionalProperties: false,
} as const;

export const assertCostUnderSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		usd: { type: "number", exclusiveMinimum: 0 },
	},
	required: ["run_id", "usd"],
	additionalProperties: false,
} as const;

export const assertNoLoopsSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		max_repeat: { type: "integer", minimum: 2 },
		window: { type: "integer", minimum: 2 },
		tool_name: { type: "string" },
	},
	required: ["run_id"],
	additionalProperties: false,
} as const;

export const assertTokenBudgetPerStepSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		max_tokens_per_event: { type: "integer", minimum: 1 },
		tool_name: { type: "string" },
	},
	required: ["run_id", "max_tokens_per_event"],
	additionalProperties: false,
} as const;

export const assertMessagesMatchSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		expected: {
			type: "array",
			items: {
				type: "object",
				properties: {
					role: { type: "string" },
					contains: { type: "string" },
					equals: { type: "string" },
					matches: { type: "string" },
				},
				additionalProperties: false,
			},
		},
		strict: { type: "boolean" },
	},
	required: ["run_id", "expected"],
	additionalProperties: false,
} as const;

export const assertToolOrderSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		sequence: { type: "array", items: { type: "string" }, minItems: 1 },
		contiguous: { type: "boolean" },
	},
	required: ["run_id", "sequence"],
	additionalProperties: false,
} as const;

export const assertLatencyUnderSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		max_total_ms: { type: "integer", minimum: 0 },
		max_per_event_ms: { type: "integer", minimum: 0 },
		tool_name: { type: "string" },
	},
	required: ["run_id"],
	additionalProperties: false,
} as const;

export const diffRunsSchema = {
	type: "object",
	properties: {
		run_id_a: { type: "string" },
		run_id_b: { type: "string" },
	},
	required: ["run_id_a", "run_id_b"],
	additionalProperties: false,
} as const;

export const replayRunSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		from_seq: { type: "integer", minimum: 0 },
		from_event_id: { type: "integer", minimum: 0 },
		substitute: { type: "object", additionalProperties: true },
	},
	required: ["run_id"],
	additionalProperties: false,
} as const;

export const recordCanonicalSchema = {
	type: "object",
	properties: {
		name: { type: "string" },
		run_ids: { type: "array", items: { type: "string" }, minItems: 1 },
	},
	required: ["name", "run_ids"],
	additionalProperties: false,
} as const;

export const getRunSchema = {
	type: "object",
	properties: { run_id: { type: "string" } },
	required: ["run_id"],
	additionalProperties: false,
} as const;

export const listRunsSchema = {
	type: "object",
	properties: { agent_id: { type: "string" } },
	additionalProperties: false,
} as const;
