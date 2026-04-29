import type { EventInput, MessageInput } from "../store.js";
import type { Run } from "../types.js";

export interface AdapterParseResult {
	run: {
		startedAt?: number;
		endedAt?: number | null;
		status?: Run["status"];
		metadata?: Record<string, unknown>;
	};
	events: EventInput[];
	messages?: MessageInput[];
}

export interface AdapterContext {
	defaultAgentId: string;
	defaultRunId: string;
}

export interface Adapter {
	name: string;
	description: string;
	parse(content: string, ctx: AdapterContext): AdapterParseResult;
}

const REGISTRY = new Map<string, Adapter>();

export function registerAdapter(a: Adapter): void {
	REGISTRY.set(a.name, a);
}

export function getAdapter(name: string): Adapter | undefined {
	return REGISTRY.get(name);
}

export function listAdapters(): Adapter[] {
	return [...REGISTRY.values()];
}

import { claudeCodeAdapter } from "./claude-code.js";
import { kovarJsonlAdapter } from "./kovar-jsonl.js";

registerAdapter(kovarJsonlAdapter);
registerAdapter(claudeCodeAdapter);
