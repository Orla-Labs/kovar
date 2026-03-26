import { expect as baseExpect } from "@playwright/test";
import { toBeAccessible } from "./accessibility.matcher.js";
import { toRequireAuthentication } from "./auth.matcher.js";
import { toHaveSecureCORS } from "./cors.matcher.js";
import { toBeCSRFProtected } from "./csrf.matcher.js";
import { toBeResilientToXSS } from "./resilient-to-xss.matcher.js";
import { toHaveSecureCookies } from "./secure-cookies.matcher.js";
import { toHaveSecureHeaders } from "./secure-headers.matcher.js";

export const securityExpect = baseExpect.extend({
	toHaveSecureHeaders,
	toHaveSecureCookies,
	toBeResilientToXSS,
	toBeCSRFProtected,
	toHaveSecureCORS,
	toRequireAuthentication,
	toBeAccessible,
});
