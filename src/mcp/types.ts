export type RunStatus = "running" | "completed" | "failed";

export interface Run {
	id: string;
	agentId: string;
	status: RunStatus;
	startedAt: number;
	endedAt: number | null;
	metadata: Record<string, unknown>;
}

export interface ToolCallEvent {
	id: number;
	runId: string;
	seq: number;
	toolName: string;
	args: Record<string, unknown>;
	result: unknown;
	costUsd: number | null;
	tokensIn: number | null;
	tokensOut: number | null;
	timestamp: number;
}

export interface Message {
	id: number;
	runId: string;
	seq: number;
	role: string;
	content: string;
	tokens: number | null;
	timestamp: number;
}

export interface Canonical {
	name: string;
	toolSequence: string[];
	createdAt: number;
}

export interface DriftDiffEntry {
	index: number;
	expected: string | null;
	actual: string | null;
}

export interface DriftReport {
	matched: boolean;
	expected: string[];
	actual: string[];
	diff: DriftDiffEntry[];
}
