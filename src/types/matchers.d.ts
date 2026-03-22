import type { CookieCheckOptions, HeaderCheckOptions, XSSCheckOptions } from "./options.js";

export interface SecurityMatchers<R> {
	toHaveSecureHeaders(options?: HeaderCheckOptions): Promise<R>;
	toHaveSecureCookies(options?: CookieCheckOptions): Promise<R>;
	toBeResilientToXSS(options?: XSSCheckOptions): Promise<R>;
}

declare module "@playwright/test" {
	interface Matchers<R, T> extends SecurityMatchers<R> {}
}
