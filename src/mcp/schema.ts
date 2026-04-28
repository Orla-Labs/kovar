const eventInputSchema = {
	type: "object",
	properties: {
		tool_name: { type: "string" },
		args: { type: "object", additionalProperties: true },
		result: {},
		cost_usd: { type: "number", minimum: 0 },
		timestamp: { type: "integer" },
	},
	required: ["tool_name", "timestamp"],
	additionalProperties: false,
} as const;

export const recordRunSchema = {
	type: "object",
	properties: {
		agent_id: { type: "string" },
		run_id: { type: "string" },
		metadata: { type: "object", additionalProperties: true },
		events: { type: "array", items: eventInputSchema },
		status: { type: "string", enum: ["completed", "failed"] },
	},
	required: ["agent_id", "run_id"],
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

export const replayRunSchema = {
	type: "object",
	properties: {
		run_id: { type: "string" },
		from_event_id: { type: "integer", minimum: 0 },
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
