import { describe, expect, it, vi } from "vitest";
import { checkAccessibility } from "../../../src/checks/accessibility.js";
import type { AccessibilityCheckOptions } from "../../../src/checks/accessibility.js";

function mockPage(context: Record<string, unknown>) {
	return {
		evaluate: vi.fn().mockResolvedValue({
			imagesWithoutAlt: 0,
			inputsWithoutLabels: [],
			buttonsWithoutName: 0,
			hasLang: true,
			hasTitle: true,
			emptyLinks: 0,
			hasMain: true,
			headingIssues: [],
			autoplayMedia: 0,
			lowContrastCount: 0,
			...context,
		}),
	} as never;
}

describe("checkAccessibility", () => {
	it("returns no findings for a fully accessible page", async () => {
		const page = mockPage({});
		const findings = await checkAccessibility(page);
		expect(findings).toHaveLength(0);
	});

	it("detects images without alt text", async () => {
		const page = mockPage({ imagesWithoutAlt: 3 });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-img-alt");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("medium");
		expect(finding!.message).toContain("3 image(s)");
		expect(finding!.cweId).toBe("CWE-1114");
		expect(finding!.category).toBe("configuration");
	});

	it("detects form inputs without labels", async () => {
		const page = mockPage({ inputsWithoutLabels: ["email", "password"] });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-input-label");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("high");
		expect(finding!.message).toContain("2 form input(s)");
		expect(finding!.message).toContain("email");
		expect(finding!.message).toContain("password");
	});

	it("detects buttons without accessible name", async () => {
		const page = mockPage({ buttonsWithoutName: 2 });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-button-name");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("high");
		expect(finding!.message).toContain("2 button(s)");
	});

	it("detects missing document language", async () => {
		const page = mockPage({ hasLang: false });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-document-lang");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("medium");
		expect(finding!.message).toContain("lang");
	});

	it("detects missing page title", async () => {
		const page = mockPage({ hasTitle: false });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-page-title");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("medium");
		expect(finding!.message).toContain("<title>");
	});

	it("detects empty links", async () => {
		const page = mockPage({ emptyLinks: 4 });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-empty-links");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("medium");
		expect(finding!.message).toContain("4 link(s)");
	});

	it("detects missing main landmark", async () => {
		const page = mockPage({ hasMain: false });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-landmark-main");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("low");
		expect(finding!.message).toContain("<main>");
	});

	it("excludes info-level findings by default", async () => {
		const page = mockPage({ lowContrastCount: 5 });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-color-contrast");
		expect(finding).toBeUndefined();
	});

	it("includes info-level findings when includeWarnings is true", async () => {
		const page = mockPage({ lowContrastCount: 5 });
		const findings = await checkAccessibility(page, { includeWarnings: true });
		const finding = findings.find((f) => f.id === "a11y-color-contrast");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("info");
		expect(finding!.message).toContain("5 element(s)");
	});

	it("detects heading hierarchy issues", async () => {
		const page = mockPage({
			headingIssues: ["<h2> appears before any <h1>", "Heading level skipped from <h2> to <h4>"],
		});
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-heading-order");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("medium");
		expect(finding!.message).toContain("<h2> appears before any <h1>");
		expect(finding!.message).toContain("skipped from <h2> to <h4>");
	});

	it("detects autoplay media without muted", async () => {
		const page = mockPage({ autoplayMedia: 1 });
		const findings = await checkAccessibility(page);
		const finding = findings.find((f) => f.id === "a11y-autoplay-media");
		expect(finding).toBeDefined();
		expect(finding!.severity).toBe("medium");
		expect(finding!.message).toContain("1 media element(s)");
	});

	it("respects skip option", async () => {
		const page = mockPage({ imagesWithoutAlt: 3, hasLang: false });
		const options: AccessibilityCheckOptions = { skip: ["a11y-img-alt"] };
		const findings = await checkAccessibility(page, options);
		expect(findings.find((f) => f.id === "a11y-img-alt")).toBeUndefined();
		expect(findings.find((f) => f.id === "a11y-document-lang")).toBeDefined();
	});

	it("respects only option", async () => {
		const page = mockPage({
			imagesWithoutAlt: 3,
			hasLang: false,
			hasTitle: false,
			hasMain: false,
		});
		const options: AccessibilityCheckOptions = { only: ["a11y-document-lang"] };
		const findings = await checkAccessibility(page, options);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.id).toBe("a11y-document-lang");
	});

	it("returns multiple findings for a page with many issues", async () => {
		const page = mockPage({
			imagesWithoutAlt: 2,
			inputsWithoutLabels: ["search"],
			buttonsWithoutName: 1,
			hasLang: false,
			hasTitle: false,
			emptyLinks: 1,
			hasMain: false,
			headingIssues: ["<h2> appears before any <h1>"],
			autoplayMedia: 1,
		});
		const findings = await checkAccessibility(page);
		expect(findings.length).toBeGreaterThanOrEqual(8);

		const ids = findings.map((f) => f.id);
		expect(ids).toContain("a11y-img-alt");
		expect(ids).toContain("a11y-input-label");
		expect(ids).toContain("a11y-button-name");
		expect(ids).toContain("a11y-document-lang");
		expect(ids).toContain("a11y-page-title");
		expect(ids).toContain("a11y-empty-links");
		expect(ids).toContain("a11y-landmark-main");
		expect(ids).toContain("a11y-heading-order");
	});

	it("sets category to configuration for all findings", async () => {
		const page = mockPage({
			imagesWithoutAlt: 1,
			hasLang: false,
			hasMain: false,
		});
		const findings = await checkAccessibility(page);
		for (const finding of findings) {
			expect(finding.category).toBe("configuration");
		}
	});

	it("includes remediation on every finding", async () => {
		const page = mockPage({
			imagesWithoutAlt: 1,
			inputsWithoutLabels: ["email"],
			buttonsWithoutName: 1,
			hasLang: false,
			hasTitle: false,
			emptyLinks: 1,
			hasMain: false,
			headingIssues: ["Heading level skipped from <h1> to <h3>"],
			autoplayMedia: 1,
		});
		const findings = await checkAccessibility(page);
		for (const finding of findings) {
			expect(finding.remediation).toBeTruthy();
		}
	});

	it("does not report zero-count issues", async () => {
		const page = mockPage({
			imagesWithoutAlt: 0,
			inputsWithoutLabels: [],
			buttonsWithoutName: 0,
			emptyLinks: 0,
			autoplayMedia: 0,
		});
		const findings = await checkAccessibility(page);
		expect(findings).toHaveLength(0);
	});
});
