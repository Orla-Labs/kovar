import { vi } from "vitest";

interface MockFrame {
	url: () => string;
	name: () => string;
}

export class MockPage {
	private exposedFunctions = new Map<string, (...args: unknown[]) => unknown>();
	private initScripts: string[] = [];
	private eventHandlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
	private _url: string;
	private _title: string;
	private _frame: MockFrame;

	exposeFunction = vi.fn(
		async (name: string, fn: (...args: unknown[]) => unknown): Promise<void> => {
			this.exposedFunctions.set(name, fn);
		},
	);

	addInitScript = vi.fn(async (script: string): Promise<void> => {
		this.initScripts.push(script);
	});

	evaluate = vi.fn(
		async <T>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> => {
			if (typeof fn === "function") {
				return fn(...args);
			}
			return undefined as T;
		},
	);

	on = vi.fn((event: string, handler: (...args: unknown[]) => unknown): void => {
		const handlers = this.eventHandlers.get(event) ?? [];
		handlers.push(handler);
		this.eventHandlers.set(event, handlers);
	});

	goto = vi.fn(async (_url: string): Promise<void> => {
		this._url = _url;
	});

	constructor(options: { url?: string; title?: string } = {}) {
		this._url = options.url ?? "https://example.com";
		this._title = options.title ?? "Test Page";
		this._frame = {
			url: () => this._url,
			name: () => "main",
		};
	}

	url(): string {
		return this._url;
	}

	title(): string {
		return this._title;
	}

	frames(): MockFrame[] {
		return [this._frame];
	}

	mainFrame(): MockFrame {
		return this._frame;
	}

	setUrl(url: string): void {
		this._url = url;
	}

	setTitle(title: string): void {
		this._title = title;
	}

	getExposedFunction(name: string): ((...args: unknown[]) => unknown) | undefined {
		return this.exposedFunctions.get(name);
	}

	getInitScripts(): string[] {
		return this.initScripts;
	}

	getEventHandlers(event: string): ((...args: unknown[]) => unknown)[] {
		return this.eventHandlers.get(event) ?? [];
	}

	async triggerEvent(event: string, ...args: unknown[]): Promise<void> {
		const handlers = this.eventHandlers.get(event) ?? [];
		for (const handler of handlers) {
			await handler(...args);
		}
	}
}
