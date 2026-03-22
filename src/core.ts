export { analyzeHeaders } from "./checks/headers.js";
export { analyzeCookies, mapPlaywrightCookies, type CookieInput } from "./checks/cookies.js";
export { XSSScanner, isReflectedUnescaped, type XSSScanResult } from "./checks/xss.js";
export { XSS_POLYGLOTS } from "./payloads/index.js";
export type * from "./types/index.js";
