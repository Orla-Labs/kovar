/**
 * kovar-jsonl adapter.
 *
 * Default file-ingest format for kovar. One JSON object per line. Each object is one of:
 *
 *   { "type": "run",   "run_id"?: string, "agent_id"?: string, "started_at"?: int,
 *     "ended_at"?: int|null, "status"?: "running"|"completed"|"failed", "metadata"?: object }
 *     (zero or one allowed; if absent, defaults from ingest context are used)
 *
 *   { "type": "event", "tool_name": string, "args"?: object, "result"?: any,
 *     "cost_usd"?: number|null, "tokens_in"?: int, "tokens_out"?: int, "timestamp": int }
 *     (zero or more)
 *
 *   { "type": "message", "role": string, "content": string, "tokens"?: int,
 *     "timestamp": int }
 *     (zero or more)
 *
 * Empty lines and lines starting with `#` are ignored. Malformed JSON or unknown `type`
 * values throw with the offending line number.
 */

import type { EventInput, MessageInput } from "../store.js";
import type { Run } from "../types.js";
import type { Adapter, AdapterContext, AdapterParseResult } from "./index.js";

interface RunLine {
	type: "run";
	run_id?: string;
	agent_id?: string;
	started_at?: number;
	ended_at?: number | null;
	status?: Run["status"];
	metadata?: Record<string, unknown>;
}

interface EventLine {
	type: "event";
	tool_name: string;
	args?: Record<string, unknown>;
	result?: unknown;
	cost_usd?: number | null;
	tokens_in?: number;
	tokens_out?: number;
	timestamp: number;
}

interface MessageLine {
	type: "message";
	role: string;
	content: string;
	tokens?: number;
	timestamp: number;
}

type Line = RunLine | EventLine | MessageLine;

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseLine(raw: string, lineNo: number): Line {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`kovar-jsonl: invalid JSON on line ${lineNo}: ${msg}`);
	}
	if (!isRecord(parsed)) {
		throw new Error(`kovar-jsonl: line ${lineNo} is not a JSON object`);
	}
	const type = parsed.type;
	if (type === "run") return parsed as unknown as RunLine;
	if (type === "event") {
		if (typeof parsed.tool_name !== "string") {
			throw new Error(`kovar-jsonl: line ${lineNo} event missing tool_name`);
		}
		if (typeof parsed.timestamp !== "number") {
			throw new Error(`kovar-jsonl: line ${lineNo} event missing numeric timestamp`);
		}
		return parsed as unknown as EventLine;
	}
	if (type === "message") {
		if (typeof parsed.role !== "string") {
			throw new Error(`kovar-jsonl: line ${lineNo} message missing role`);
		}
		if (typeof parsed.content !== "string") {
			throw new Error(`kovar-jsonl: line ${lineNo} message missing content`);
		}
		if (typeof parsed.timestamp !== "number") {
			throw new Error(`kovar-jsonl: line ${lineNo} message missing numeric timestamp`);
		}
		return parsed as unknown as MessageLine;
	}
	throw new Error(`kovar-jsonl: line ${lineNo} has unknown type: ${JSON.stringify(type)}`);
}

function eventFromLine(line: EventLine): EventInput {
	const ev: EventInput = {
		toolName: line.tool_name,
		args: line.args ?? {},
		result: line.result === undefined ? null : line.result,
		costUsd: line.cost_usd ?? null,
		timestamp: line.timestamp,
	};
	if (line.tokens_in !== undefined) ev.tokensIn = line.tokens_in;
	if (line.tokens_out !== undefined) ev.tokensOut = line.tokens_out;
	return ev;
}

function messageFromLine(line: MessageLine): MessageInput {
	return {
		role: line.role,
		content: line.content,
		tokens: line.tokens ?? null,
		timestamp: line.timestamp,
	};
}

function buildResult(
	runLine: RunLine | undefined,
	events: EventInput[],
	messages: MessageInput[],
): AdapterParseResult {
	const result: AdapterParseResult = {
		run: { metadata: runLine?.metadata ?? {} },
		events,
		messages,
	};
	if (runLine?.started_at !== undefined) result.run.startedAt = runLine.started_at;
	if (runLine?.ended_at !== undefined) result.run.endedAt = runLine.ended_at;
	if (runLine?.status !== undefined) result.run.status = runLine.status;
	return result;
}

export const kovarJsonlAdapter: Adapter = {
	name: "kovar-jsonl",
	description: "Default kovar JSONL format (run/event/message lines).",
	parse(content: string, _ctx: AdapterContext): AdapterParseResult {
		const events: EventInput[] = [];
		const messages: MessageInput[] = [];
		let runLine: RunLine | undefined;

		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const raw = lines[i] ?? "";
			const trimmed = raw.trim();
			if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
			const parsed = parseLine(trimmed, i + 1);
			if (parsed.type === "run") {
				if (runLine) {
					throw new Error(
						`kovar-jsonl: line ${i + 1} contains a second run object (only one allowed)`,
					);
				}
				runLine = parsed;
			} else if (parsed.type === "event") {
				events.push(eventFromLine(parsed));
			} else {
				messages.push(messageFromLine(parsed));
			}
		}

		return buildResult(runLine, events, messages);
	},
};
