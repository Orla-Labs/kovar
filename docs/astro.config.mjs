import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://kovar.orlalabs.com",
	integrations: [
		starlight({
			title: "Kovar",
			description: "Security testing assertions + AI-powered test recording for Playwright",
			social: [{ icon: "github", label: "GitHub", href: "https://github.com/Orla-Labs/kovar" }],
			head: [
				{
					tag: "meta",
					attrs: { property: "og:image", content: "https://kovar.orlalabs.com/og-image.png" },
				},
				{ tag: "meta", attrs: { property: "og:image:width", content: "1280" } },
				{ tag: "meta", attrs: { property: "og:image:height", content: "640" } },
				{ tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
				{
					tag: "meta",
					attrs: { name: "twitter:image", content: "https://kovar.orlalabs.com/og-image.png" },
				},
			],
			sidebar: [
				{
					label: "Getting Started",
					items: [
						{ label: "Introduction", slug: "getting-started/introduction" },
						{ label: "Installation", slug: "getting-started/installation" },
						{ label: "Quick Start", slug: "getting-started/quick-start" },
					],
				},
				{
					label: "Security Checks",
					items: [
						{ label: "Headers", slug: "checks/headers" },
						{ label: "Cookies", slug: "checks/cookies" },
						{ label: "XSS", slug: "checks/xss" },
						{ label: "CSRF", slug: "checks/csrf" },
						{ label: "CORS", slug: "checks/cors" },
						{ label: "Authentication", slug: "checks/auth" },
						{ label: "Accessibility", slug: "checks/accessibility" },
					],
				},
				{
					label: "Fixtures & Matchers",
					items: [
						{ label: "Security Fixture", slug: "api/fixture" },
						{ label: "Full Audit", slug: "api/audit" },
						{ label: "Standalone API", slug: "api/standalone" },
					],
				},
				{
					label: "Remediation",
					items: [
						{ label: "Auto-Remediation", slug: "remediation/overview" },
						{ label: "Framework Support", slug: "remediation/frameworks" },
					],
				},
				{
					label: "Compliance",
					items: [
						{ label: "OWASP ASVS", slug: "compliance/owasp-asvs" },
						{ label: "PCI-DSS", slug: "compliance/pci-dss" },
						{ label: "Report Formats", slug: "compliance/reports" },
					],
				},
				{
					label: "CI/CD",
					items: [
						{ label: "GitHub Action", slug: "ci/github-action" },
						{ label: "Baseline Tracking", slug: "ci/baseline" },
						{ label: "Reporter", slug: "ci/reporter" },
					],
				},
				{
					label: "Recorder",
					items: [
						{ label: "Getting Started", slug: "recorder/getting-started" },
						{ label: "What Gets Generated", slug: "recorder/output" },
						{ label: "CLI Reference", slug: "recorder/cli" },
						{ label: "Self-Healing", slug: "recorder/self-healing" },
						{ label: "Codebase Awareness", slug: "recorder/codebase-awareness" },
						{ label: "How It Works", slug: "recorder/internals" },
					],
				},
				{
					label: "Reference",
					items: [
						{ label: "SecurityFinding", slug: "reference/types" },
						{ label: "Limitations", slug: "reference/limitations" },
					],
				},
			],
		}),
	],
});
