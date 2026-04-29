/**
 * Claude Code session JSONL adapter.
 *
 * Claude Code session files live at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`.
 * Each line is a JSON object roughly shaped like:
 *
 *   {"type":"user","message":{"role":"user","content":"..."},"timestamp":"2026-..."}
 *   {"type":"assistant","message":{"role":"assistant","content":[
 *      {"type":"text","text":"..."},
 *      {"type":"tool_use","id":"...","name":"...","input":{...}}
 *   ]},"timestamp":"..."}
 *   {"type":"user","message":{"role":"user","content":[
 *      {"type":"tool_result","tool_use_id":"...","content":"..."}
 *   ]},"timestamp":"..."}
 *
 * Mapping:
 *   - tool_use block          -> event (toolName=name, args=input, timestamp from assistant ts)
 *   - tool_result block       -> updates result on the matching event by tool_use_id
 *   - plain text user/assistant message -> message (role + flattened text content)
 *
 * NOTE: The Claude Code session format is undocumented; this adapter targets the
 * format observed as of April 2026 and may need updates.
 */

import type { EventInput, MessageInput } from "../store.js";
import type { Adapter, AdapterContext, AdapterParseResult } from "./index.js";

interface AnyBlock {
	type?: string;
	text?: string;
	id?: string;
	name?: string;
	input?: unknown;
	tool_use_id?: string;
	content?: unknown;
}

interface SessionLine {
	type?: string;
	timestamp?: string;
	message?: {
		role?: string;
		content?: unknown;
	};
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseTimestamp(ts: string | undefined, fallback: number): number {
	if (!ts) return fallback;
	const ms = Date.parse(ts);
	return Number.isFinite(ms) ? ms : fallback;
}

function toolResultContentToValue(content: unknown): unknown {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const texts: string[] = [];
		let allText = true;
		for (const block of content) {
			if (!isRecord(block)) {
				allText = false;
				break;
			}
			const b = block as AnyBlock;
			if (b.type === "text" && typeof b.text === "string") {
				texts.push(b.text);
			} else {
				allText = false;
				break;
			}
		}
		if (allText) return texts.join("\n");
		return content;
	}
	return content ?? null;
}

interface BlockState {
	events: EventInput[];
	messages: MessageInput[];
	eventIdxByToolUseId: Map<string, number>;
}

function handleBlock(b: AnyBlock, ts: number, textParts: string[], state: BlockState): void {
	if (b.type === "text" && typeof b.text === "string") {
		textParts.push(b.text);
		return;
	}
	if (b.type === "tool_use" && typeof b.name === "string") {
		const argsObj = isRecord(b.input) ? (b.input as Record<string, unknown>) : {};
		state.events.push({
			toolName: b.name,
			args: argsObj,
			result: null,
			costUsd: null,
			timestamp: ts,
		});
		if (typeof b.id === "string") {
			state.eventIdxByToolUseId.set(b.id, state.events.length - 1);
		}
		return;
	}
	if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
		const idx = state.eventIdxByToolUseId.get(b.tool_use_id);
		if (idx !== undefined) {
			const target = state.events[idx];
			if (target) target.result = toolResultContentToValue(b.content);
		}
	}
}

function parseSessionLine(line: string, fallbackTs: number, state: BlockState): void {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return;
	}
	if (!isRecord(parsed)) return;
	const sessionLine = parsed as SessionLine;
	const ts = parseTimestamp(sessionLine.timestamp, fallbackTs);
	const msg = sessionLine.message;
	if (!isRecord(msg)) return;

	const role = typeof msg.role === "string" ? msg.role : (sessionLine.type ?? "user");
	const blocks = msg.content;

	if (typeof blocks === "string") {
		if (blocks.length > 0) {
			state.messages.push({ role, content: blocks, tokens: null, timestamp: ts });
		}
		return;
	}
	if (!Array.isArray(blocks)) return;

	const textParts: string[] = [];
	for (const rawBlock of blocks) {
		if (!isRecord(rawBlock)) continue;
		handleBlock(rawBlock as AnyBlock, ts, textParts, state);
	}
	if (textParts.length > 0) {
		state.messages.push({
			role,
			content: textParts.join("\n"),
			tokens: null,
			timestamp: ts,
		});
	}
}

export const claudeCodeAdapter: Adapter = {
	name: "claude-code",
	description: "Claude Code session JSONL files (~/.claude/projects/<cwd>/<sessionId>.jsonl).",
	parse(content: string, _ctx: AdapterContext): AdapterParseResult {
		const state: BlockState = {
			events: [],
			messages: [],
			eventIdxByToolUseId: new Map(),
		};
		const now = Date.now();
		for (const raw of content.split("\n")) {
			const trimmed = raw.trim();
			if (trimmed.length === 0) continue;
			parseSessionLine(trimmed, now, state);
		}

		const { events, messages } = state;
		const startedAt = events[0]?.timestamp ?? messages[0]?.timestamp;
		const endedAt = events.at(-1)?.timestamp ?? messages.at(-1)?.timestamp;

		const result: AdapterParseResult = {
			run: {
				metadata: { source: "claude-code" },
				status: "completed",
			},
			events,
			messages,
		};
		if (startedAt !== undefined) result.run.startedAt = startedAt;
		if (endedAt !== undefined) result.run.endedAt = endedAt;
		return result;
	},
};
