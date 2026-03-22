import type { APIRequestContext, BrowserContext, Page, TestInfo } from "@playwright/test";
import { analyzeCookies, mapPlaywrightCookies } from "../checks/cookies.js";
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

interface AuditOptions {
	includeXSS?: boolean;
	xss?: XSSCheckOptions;
	headers?: HeaderCheckOptions;
	cookies?: CookieCheckOptions;
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
			const messages = critical.map((f) => `[${f.severity.toUpperCase()}] ${f.message}`);
			throw new Error(`Security assertion failed:\n${messages.join("\n")}`);
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
		const start = Date.now();
		const url = this.page.url();
		const explicitChecks = options?.checks ? new Set(options.checks) : null;

		const allFindings: SecurityFinding[] = [];

		for (const entry of this.auditChecks) {
			const explicitlyListed = explicitChecks?.has(entry.name);
			const enabledByFlag = entry.name === "xss" && options?.includeXSS;

			if (entry.optIn && !explicitlyListed && !enabledByFlag) continue;
			if (explicitChecks && !explicitlyListed) continue;

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
