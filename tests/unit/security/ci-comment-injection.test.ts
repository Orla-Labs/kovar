/**
 * R2 PoC: target-controlled strings (cookie names, header values) are interpolated
 * raw into the HTML/markdown PR comment the GitHub Action posts with the repo token.
 */
import { describe, expect, it } from "vitest";
import { formatPRComment } from "../../../src/ci/github-comment.js";
import type { SecurityFinding } from "../../../src/types/results.js";

describe("R2 PoC: PR comment escaping", () => {
	it("neutralises HTML, markdown images/links and @mentions from the scanned site", () => {
		const f = {
			id: "header-x-frame-options",
			category: "headers",
			severity: "high",
			message:
				'X-Frame-Options is "</summary></details>![x](https://evil.example/t.png) [Approve](https://evil.example) @org/admins", should be "DENY"',
			remediation: "Set it",
		} as SecurityFinding;
		const out = formatPRComment([f], {
			url: "https://preview.example/<img src=x>",
			score: 50,
			threshold: "high",
			passed: false,
		});
		expect(out).not.toContain("</summary></details>![");
		expect(out).not.toContain("<img src=x>");
		expect(out).not.toMatch(/!\[x\]\(https:\/\/evil/);
		expect(out).not.toMatch(/(^|[^\w`])@org\/admins/);
	});
});
