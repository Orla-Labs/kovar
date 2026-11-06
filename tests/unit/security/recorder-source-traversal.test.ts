/**
 * R2 PoC: with `kovar record --source <dir>`, the file path comes from the
 * page's `data-kovar-file` DOM attribute and was join()ed onto sourceDir with no
 * containment check, so a malicious page could make the recorder read and parse
 * arbitrary local files (extracted JSX strings are then sent to the LLM).
 */
import { describe, expect, it, vi } from "vitest";

const parseSourceLocation = vi.fn(() => null);
vi.mock("../../../src/source/parser.js", () => ({ parseSourceLocation }));

import { RecordingSession } from "../../../src/recorder/index.js";
import type { SessionData } from "../../../src/recorder/types.js";

function sessionWith(files: string[]): SessionData {
	return {
		startUrl: "http://127.0.0.1/",
		finalUrl: "http://127.0.0.1/",
		pageTitle: "",
		requests: [],
		assertions: [],
		startTime: 0,
		endTime: 1,
		actions: files.map((f) => ({
			type: "click",
			timestamp: 0,
			url: "http://127.0.0.1/",
			element: { tagName: "button", kovarFile: f, kovarLine: "1", kovarCol: "0" },
		})) as unknown as SessionData["actions"],
	};
}

describe("R2 PoC: --source path containment", () => {
	it("never reads files outside the source directory", async () => {
		const s = new RecordingSession({ url: "http://127.0.0.1/", sourceDir: "/proj/src" });
		const resolve = (
			s as unknown as { resolveSourceMetadata: (d: SessionData, dir: string) => Promise<unknown> }
		).resolveSourceMetadata.bind(s);
		await resolve(
			sessionWith([
				"../../../home/user/.config/secrets.js",
				"/etc/passwd",
				"components/Button.tsx",
				"../src-evil/x.tsx",
			]),
			"/proj/src",
		);
		const paths = parseSourceLocation.mock.calls.map((c) => c[0] as string);
		expect(paths).toEqual(["/proj/src/components/Button.tsx"]);
	});
});
