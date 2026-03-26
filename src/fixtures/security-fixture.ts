import type { APIRequestContext, BrowserContext, Page, TestInfo } from "@playwright/test";
import type { AccessibilityCheckOptions } from "../checks/accessibility.js";
import { checkAccessibility } from "../checks/accessibility.js";
import type { AuthCheckOptions } from "../checks/auth.js";
import { checkAuth } from "../checks/auth.js";
import { analyzeCookies, mapPlaywrightCookies } from "../checks/cookies.js";
import type { CORSCheckOptions } from "../checks/cors.js";
import { checkCORS } from "../checks/cors.js";
import type { CSRFCheckOptions } from "../checks/csrf.js";
import { checkCSRF } from "../checks/csrf.js";
import { analyzeHeaders } from "../checks/headers.js";
import { XSSScanner } from "../checks/xss.js";
import type {
	CookieCheckOptions,
	HeaderCheckOptions,
	SecurityFinding,
	SecurityReport,
	XSSCheckOptions,
} from "../types/index.js";
import { summarize } from "../types/results.js";

function summarizeSeverities(findings: SecurityFinding[]): string {
	const counts: Record<string, number> = {};
	for (const f of findings) {
		counts[f.severity] = (counts[f.severity] || 0) + 1;
	}
	return Object.entries(counts)
		.map(([sev, n]) => `${n} ${sev}`)
		.join(", ");
}

export class SecurityAssertionError extends Error {
	constructor(
		public readonly findings: SecurityFinding[],
		public readonly url: string,
	) {
		const summary = summarizeSeverities(findings);
		const details = findings.map((f) => `  [${f.severity.toUpperCase()}] ${f.message}`).join("\n");
		super(`Security assertion failed (${summary}) at ${url}:\n${details}`);
		this.name = "SecurityAssertionError";
	}
}

interface AuditOptions {
	includeXSS?: boolean;
	xss?: XSSCheckOptions;
	headers?: HeaderCheckOptions;
	cookies?: CookieCheckOptions;
	csrf?: CSRFCheckOptions;
	cors?: CORSCheckOptions;
	auth?: AuthCheckOptions;
	accessibility?: AccessibilityCheckOptions;
	/** Explicit list of check names to run. Defaults to ["headers", "cookies"] (plus "xss" if includeXSS). */
	checks?: string[];
}

export class CheckFacade<TOptions = unknown> {
	constructor(
		protected fixture: SecurityFixture,
		private checkFn: (options?: TOptions) => Promise<SecurityFinding[]>,
	) {}

	async assert(options?: TOptions): Promise<void> {
		const findings = await this.check(options);
		const critical = findings.filter((f) => f.severity === "critical" || f.severity === "high");
		if (critical.length > 0) {
			throw new SecurityAssertionError(critical, this.fixture.getPageUrl());
		}
	}

	async check(options?: TOptions): Promise<SecurityFinding[]> {
		const findings = await this.checkFn(options);
		this.fixture.addFindings(findings);
		return findings;
	}
}

interface AuditCheckEntry {
	name: string;
	run: (options: AuditOptions) => Promise<SecurityFinding[]>;
	/** When true, only runs if explicitly enabled (e.g., includeXSS or listed in checks). */
	optIn?: boolean;
}

export class SecurityFixture {
	readonly headers: CheckFacade<HeaderCheckOptions>;
	readonly cookies: CheckFacade<CookieCheckOptions>;
	readonly xss: CheckFacade<XSSCheckOptions>;
	readonly csrf: CheckFacade<CSRFCheckOptions>;
	readonly cors: CheckFacade<CORSCheckOptions>;
	readonly auth: CheckFacade<AuthCheckOptions>;
	readonly accessibility: CheckFacade<AccessibilityCheckOptions>;
	private findings: SecurityFinding[] = [];
	private testInfo: TestInfo | null = null;
	private auditChecks: AuditCheckEntry[] = [];

	constructor(
		private page: Page,
		private context: BrowserContext,
		private request: APIRequestContext,
	) {
		this.headers = new CheckFacade(this, (opts) => this.checkHeaders(opts));
		this.cookies = new CheckFacade(this, (opts) => this.checkCookies(opts));
		this.xss = new CheckFacade(this, (opts) => this.checkXSS(opts));
		this.csrf = new CheckFacade(this, (opts) => checkCSRF(this.request, this.page.url(), opts));
		this.cors = new CheckFacade(this, (opts) => checkCORS(this.request, this.page.url(), opts));
		this.auth = new CheckFacade(this, (opts) => checkAuth(this.request, this.page.url(), opts));
		this.accessibility = new CheckFacade(this, (opts) => checkAccessibility(this.page, opts));

		this.registerAuditCheck({
			name: "headers",
			run: (opts) => this.checkHeaders(opts.headers),
		});
		this.registerAuditCheck({
			name: "cookies",
			run: (opts) => this.checkCookies(opts.cookies),
		});
		this.registerAuditCheck({
			name: "xss",
			run: (opts) => this.checkXSS(opts.xss),
			optIn: true,
		});
		this.registerAuditCheck({
			name: "csrf",
			run: (opts) => checkCSRF(this.request, this.page.url(), opts.csrf),
			optIn: true,
		});
		this.registerAuditCheck({
			name: "cors",
			run: (opts) => checkCORS(this.request, this.page.url(), opts.cors),
			optIn: true,
		});
		this.registerAuditCheck({
			name: "auth",
			run: (opts) => checkAuth(this.request, this.page.url(), opts.auth),
			optIn: true,
		});
		this.registerAuditCheck({
			name: "accessibility",
			run: (opts) => checkAccessibility(this.page, opts.accessibility),
			optIn: true,
		});
	}

	getPageUrl(): string {
		try {
			return this.page.url();
		} catch {
			return "unknown";
		}
	}

	setTestInfo(info: TestInfo): void {
		this.testInfo = info;
	}

	addFindings(findings: SecurityFinding[]): void {
		this.findings.push(...findings);
	}

	/** Register a custom check to run during audit(). Opt-in checks require explicit enablement. */
	registerAuditCheck(entry: AuditCheckEntry): void {
		this.auditChecks.push(entry);
	}

	async audit(options?: AuditOptions): Promise<SecurityReport> {
		if (this.page.isClosed()) {
			console.warn("[kovar] Page is closed, skipping security checks");
			return {
				url: "unknown",
				timestamp: new Date().toISOString(),
				duration: 0,
				findings: [],
				summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
			};
		}

		const start = Date.now();
		const url = this.page.url();
		const explicitChecks = options?.checks ? new Set(options.checks) : null;

		if (explicitChecks && options?.includeXSS !== undefined) {
			console.warn(
				'[kovar] Both "checks" and "includeXSS" provided to audit(). "checks" takes precedence; "includeXSS" is ignored.',
			);
		}

		const allFindings: SecurityFinding[] = [];

		for (const entry of this.auditChecks) {
			if (explicitChecks) {
				if (!explicitChecks.has(entry.name)) continue;
			} else {
				const enabledByFlag = entry.name === "xss" && options?.includeXSS;
				if (entry.optIn && !enabledByFlag) continue;
			}

			const findings = await entry.run(options ?? {});
			allFindings.push(...findings);
		}

		this.findings.push(...allFindings);

		return {
			url,
			timestamp: new Date().toISOString(),
			duration: Date.now() - start,
			findings: allFindings,
			summary: summarize(allFindings),
		};
	}

	async cleanup(): Promise<void> {
		if (this.testInfo && this.findings.length > 0) {
			await this.testInfo.attach("kovar-findings", {
				body: JSON.stringify(this.findings),
				contentType: "application/json",
			});
		}
	}

	private async checkHeaders(options?: HeaderCheckOptions): Promise<SecurityFinding[]> {
		if (this.page.isClosed()) {
			console.warn("[kovar] Page is closed, skipping header checks");
			return [];
		}

		const url = this.page.url();
		if (!url || url === "about:blank") return [];

		const response = await this.request.fetch(url);
		return analyzeHeaders(response.headers(), options);
	}

	private async checkCookies(options?: CookieCheckOptions): Promise<SecurityFinding[]> {
		const rawCookies = await this.context.cookies();
		return analyzeCookies(mapPlaywrightCookies(rawCookies), options);
	}

	private async checkXSS(options?: XSSCheckOptions): Promise<SecurityFinding[]> {
		const scanner = new XSSScanner(this.page, this.request);
		const result = await scanner.scan(options);
		return result.findings;
	}
}
