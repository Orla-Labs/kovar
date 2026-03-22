import { expect as baseExpect } from "@playwright/test";
import { toBeResilientToXSS } from "./resilient-to-xss.matcher.js";
import { toHaveSecureCookies } from "./secure-cookies.matcher.js";
import { toHaveSecureHeaders } from "./secure-headers.matcher.js";

export const securityExpect = baseExpect.extend({
	toHaveSecureHeaders,
	toHaveSecureCookies,
	toBeResilientToXSS,
});
