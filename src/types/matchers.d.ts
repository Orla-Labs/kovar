import type { AccessibilityCheckOptions } from "../checks/accessibility.js";
import type { AuthCheckOptions } from "../checks/auth.js";
import type { CORSCheckOptions } from "../checks/cors.js";
import type { CSRFCheckOptions } from "../checks/csrf.js";
import type { CookieCheckOptions, HeaderCheckOptions, XSSCheckOptions } from "./options.js";

export interface SecurityMatchers<R> {
	toHaveSecureHeaders(options?: HeaderCheckOptions): Promise<R>;
	toHaveSecureCookies(options?: CookieCheckOptions): Promise<R>;
	toBeResilientToXSS(options?: XSSCheckOptions): Promise<R>;
	toBeCSRFProtected(url: string, options?: CSRFCheckOptions): Promise<R>;
	toHaveSecureCORS(url: string, options?: CORSCheckOptions): Promise<R>;
	toRequireAuthentication(url: string, options?: AuthCheckOptions): Promise<R>;
	toBeAccessible(options?: AccessibilityCheckOptions): Promise<R>;
}

declare module "@playwright/test" {
	interface Matchers<R, T> extends SecurityMatchers<R> {}
}
