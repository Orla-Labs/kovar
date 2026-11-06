import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Detection-accuracy fixture app.
 *
 * Every route is either known-vulnerable (/vuln/...) or known-good (/good/...).
 * Kovar should flag every /vuln route and pass every /good route. Routes are
 * deliberately small and each one isolates a single behavior.
 */

const GOOD_HEADERS: Record<string, string> = {
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains",
	"Content-Security-Policy":
		"default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "require-corp",
};

const SESSION_VALUE = "s3cr3t-session";

function escapeAll(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Escapes exactly what the HTML spec requires inside a text node (&, <, >).
// Quotes are harmless in text context; e.g. Python html.escape(s, quote=False).
function escapeText(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function html(body: string, head = ""): string {
	return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
}

async function readBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const c of req) chunks.push(c as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

function parseForm(body: string): URLSearchParams {
	return new URLSearchParams(body);
}

function hasSession(req: IncomingMessage): boolean {
	return (req.headers.cookie ?? "").includes(`sid=${SESSION_VALUE}`);
}

type Handler = (
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	body: string,
) => void | Promise<void>;

const comments: string[] = [];

const routes: Record<string, Handler> = {
	// ---------------------------------------------------------------- headers
	"/good/headers": (_q, res) => {
		res.writeHead(200, { ...GOOD_HEADERS, "Content-Type": "text/html" });
		res.end(html("<h1>good headers</h1>"));
	},
	"/vuln/csp-default-unsafe-inline": (_q, res) => {
		res.writeHead(200, {
			...GOOD_HEADERS,
			"Content-Security-Policy": "default-src 'self' 'unsafe-inline'",
		});
		res.end(html("x"));
	},
	"/vuln/csp-no-script-restriction": (_q, res) => {
		res.writeHead(200, { ...GOOD_HEADERS, "Content-Security-Policy": "frame-ancestors 'none'" });
		res.end(html("x"));
	},
	"/vuln/csp-scheme-sources": (_q, res) => {
		res.writeHead(200, {
			...GOOD_HEADERS,
			"Content-Security-Policy": "default-src 'self'; script-src 'self' https: data:",
		});
		res.end(html("x"));
	},
	"/vuln/csp-uppercase-unsafe-eval": (_q, res) => {
		res.writeHead(200, {
			...GOOD_HEADERS,
			"Content-Security-Policy": "default-src 'self'; SCRIPT-SRC 'self' 'unsafe-eval'",
		});
		res.end(html("x"));
	},
	"/vuln/csp-report-only": (_q, res) => {
		const { "Content-Security-Policy": csp, ...rest } = GOOD_HEADERS;
		res.writeHead(200, { ...rest, "Content-Security-Policy-Report-Only": csp ?? "" });
		res.end(html("x"));
	},
	"/good/csp-strict-dynamic": (_q, res) => {
		// Google "strict CSP" recommended shape: hash + strict-dynamic, with
		// 'unsafe-inline' and https: as back-compat fallbacks ignored by CSP3 browsers.
		res.writeHead(200, {
			...GOOD_HEADERS,
			"Content-Security-Policy":
				"script-src 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'strict-dynamic' 'unsafe-inline' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
		});
		res.end(html("x"));
	},
	"/good/duplicate-headers": (_q, res) => {
		// Same header emitted twice with identical values (common when both a
		// framework middleware and a CDN/reverse proxy set it).
		const raw: string[] = [];
		for (const [k, v] of Object.entries(GOOD_HEADERS)) raw.push(k, v);
		raw.push("X-Frame-Options", "DENY", "X-Content-Type-Options", "nosniff");
		res.writeHead(200, raw);
		res.end(html("x"));
	},
	"/good/hsts-quoted": (_q, res) => {
		res.writeHead(200, {
			...GOOD_HEADERS,
			"Strict-Transport-Security": 'max-age="63072000"; includeSubDomains',
		});
		res.end(html("x"));
	},
	"/good/frame-ancestors-only": (_q, res) => {
		const { "X-Frame-Options": _xfo, ...rest } = GOOD_HEADERS;
		res.writeHead(200, rest);
		res.end(html("x"));
	},

	// ---------------------------------------------------------------- cookies
	"/vuln/cookie-rails": (_q, res) => {
		res.writeHead(200, { "Set-Cookie": "_myapp_session=abc123; path=/" });
		res.end(html("rails"));
	},
	"/vuln/cookie-laravel": (_q, res) => {
		res.writeHead(200, { "Set-Cookie": "laravel_session=abc123; path=/" });
		res.end(html("laravel"));
	},
	"/vuln/cookie-auth0": (_q, res) => {
		res.writeHead(200, { "Set-Cookie": "appSession=abc123; path=/" });
		res.end(html("auth0"));
	},
	"/vuln/cookie-sessionid": (_q, res) => {
		res.writeHead(200, { "Set-Cookie": "sessionid=abc123; path=/" });
		res.end(html("django"));
	},
	"/good/cookie-xsrf-token": (_q, res) => {
		// Angular / axios double-submit cookie: MUST be JS-readable.
		res.writeHead(200, {
			"Set-Cookie": [
				"__Host-sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax",
				"XSRF-TOKEN=tok; Path=/; Secure; SameSite=Lax",
			],
		});
		res.end(html("angular"));
	},
	"/good/cookie-django-csrftoken": (_q, res) => {
		res.writeHead(200, {
			"Set-Cookie": [
				"sessionid=abc; Path=/; Secure; HttpOnly; SameSite=Lax",
				"csrftoken=tok; Path=/; Secure; SameSite=Lax",
			],
		});
		res.end(html("django"));
	},

	// ---------------------------------------------------------------- XSS
	"/vuln/xss-reflect": (_q, res, url) => {
		const q = url.searchParams.get("q");
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(
				`<form method="GET" action="/vuln/xss-reflect"><input name="q"><button type="submit">Go</button></form>${q ? `<p>${q}</p>` : ""}`,
			),
		);
	},
	"/good/xss-escaped": (_q, res, url) => {
		const q = url.searchParams.get("q");
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(
				`<script src="/static/app.js"></script><form method="GET" action="/good/xss-escaped"><input name="q"><button type="submit">Go</button></form>${q ? `<p>${escapeAll(q)}</p>` : ""}`,
			),
		);
	},
	"/good/xss-text-escaped": (_q, res, url) => {
		// Correctly escaped for a text node (&<>), quotes left alone. Not exploitable.
		const q = url.searchParams.get("q");
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(
				`<script src="/static/app.js"></script><form method="GET" action="/good/xss-text-escaped"><input name="q"><button type="submit">Go</button></form>${q ? `<p>You searched: ${escapeText(q)}</p>` : ""}`,
			),
		);
	},
	"/vuln/xss-csrf-protected-form": (req, res, _url, body) => {
		// Typical Rails/Django/Laravel form: hidden CSRF token, 403 without it.
		if (req.method === "POST") {
			const f = parseForm(body);
			if (f.get("authenticity_token") !== "tok123") {
				res.writeHead(403, { "Content-Type": "text/html" });
				res.end(html("<p>Invalid authenticity token</p>"));
				return;
			}
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(html(`<p>Saved: ${f.get("title") ?? ""}</p>`));
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(
				`<form method="POST" action="/vuln/xss-csrf-protected-form"><input type="hidden" name="authenticity_token" value="tok123"><input name="title"><button type="submit">Save</button></form>`,
			),
		);
	},
	"/vuln/xss-validation-error": (req, res, _url, body) => {
		if (req.method === "POST") {
			const email = parseForm(body).get("email") ?? "";
			if (!email.includes("@") || email.includes("<")) {
				res.writeHead(422, { "Content-Type": "text/html" });
				res.end(html(`<p class="error">Invalid email address: ${email}</p>`));
				return;
			}
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(html("<p>ok</p>"));
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(
				`<form method="POST" action="/vuln/xss-validation-error"><input name="email"><button type="submit">Subscribe</button></form>`,
			),
		);
	},
	"/vuln/xss-spa-fetch": (_q, res) => {
		// SPA: JS handler prevents default, calls JSON API, renders via innerHTML.
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(`<form id="f"><input name="q" id="q"><button>Search</button></form><div id="out"></div>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/search?q=' + encodeURIComponent(document.getElementById('q').value));
  const j = await r.json();
  document.getElementById('out').innerHTML = 'Results for ' + j.q;
});
</script>`),
		);
	},
	"/vuln/xss-spa-fetch-typed-button": (_q, res) => {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(`<form id="f"><input name="q" id="q"><button type="submit">Search</button></form><div id="out"></div>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/search?q=' + encodeURIComponent(document.getElementById('q').value));
  const j = await r.json();
  document.getElementById('out').innerHTML = 'Results for ' + j.q;
});
</script>`),
		);
	},
	"/api/search": (_q, res, url) => {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ q: url.searchParams.get("q") ?? "" }));
	},
	"/vuln/xss-no-form-input": (_q, res) => {
		// Search box without a <form> wrapper (very common in SPAs); DOM sink.
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(`<input id="q" placeholder="search"><div id="out"></div>
<script>
document.getElementById('q').addEventListener('input', (e) => {
  document.getElementById('out').innerHTML = e.target.value;
});
</script>`),
		);
	},
	"/vuln/xss-stored-json": async (req, res, _url, body) => {
		// Form POSTs to a JSON API (201); comments rendered unescaped on the list page.
		if (req.method === "POST") {
			comments.push(parseForm(body).get("comment") ?? "");
			res.writeHead(201, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, id: comments.length }));
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(
				`<form method="POST" action="/vuln/xss-stored-json"><input name="comment"><button type="submit">Post</button></form><ul>${comments.map((c) => `<li>${c}</li>`).join("")}</ul>`,
			),
		);
	},
	"/vuln/xss-alert-filtered": (_q, res, url) => {
		// Naive blocklist strips "alert" but leaves markup intact: still exploitable.
		const q = (url.searchParams.get("q") ?? "").replace(/alert/gi, "");
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			html(
				`<form method="GET" action="/vuln/xss-alert-filtered"><input name="q"><button type="submit">Go</button></form>${q ? `<p>${q}</p>` : ""}`,
			),
		);
	},
	"/vuln/xss-reflect-csp-blocked": (_q, res, url) => {
		const q = url.searchParams.get("q");
		res.writeHead(200, { ...GOOD_HEADERS, "Content-Type": "text/html" });
		res.end(
			html(
				`<form method="GET" action="/vuln/xss-reflect-csp-blocked"><input name="q"><button type="submit">Go</button></form>${q ? `<p>${q}</p>` : ""}`,
			),
		);
	},

	// ---------------------------------------------------------------- session / auth / CSRF
	"/login": (_q, res) => {
		res.writeHead(200, {
			"Content-Type": "text/html",
			"Set-Cookie": `sid=${SESSION_VALUE}; Path=/; HttpOnly`,
		});
		res.end(html("<h1>Login page</h1><form method=POST><input name=user></form>"));
	},
	"/good/auth-redirect": (req, res) => {
		// Classic server-rendered app: unauthenticated -> 302 to /login.
		if (!hasSession(req)) {
			res.writeHead(302, { Location: "/login" });
			res.end();
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(html("<h1>Account</h1>"));
	},
	"/good/auth-401": (req, res) => {
		if (!hasSession(req)) {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "unauthorized" }));
			return;
		}
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ account: 1 }));
	},
	"/vuln/auth-open": (_q, res) => {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ account: 1, email: "a@b.c" }));
	},
	"/vuln/csrf-form-no-token": async (req, res, _url, body) => {
		// Cookie-session form endpoint, no token, no Origin check. Classic CSRF.
		if (!hasSession(req)) {
			res.writeHead(401);
			res.end();
			return;
		}
		if (req.method !== "POST") {
			res.writeHead(405);
			res.end();
			return;
		}
		const ct = req.headers["content-type"] ?? "";
		if (!ct.startsWith("application/x-www-form-urlencoded")) {
			res.writeHead(415);
			res.end();
			return;
		}
		parseForm(body);
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(html("<p>Email changed</p>"));
	},
	"/good/csrf-origin-check": async (req, res) => {
		// Fetch-metadata / Origin based protection (Go 1.25 http.CrossOriginProtection,
		// Rails/Next server actions). Requests from non-browser clients (no Origin,
		// no Sec-Fetch-Site) are allowed, as browsers always send them cross-site.
		const site = req.headers["sec-fetch-site"];
		const origin = req.headers.origin;
		const self = `http://${req.headers.host}`;
		if ((site && site !== "same-origin" && site !== "none") || (origin && origin !== self)) {
			res.writeHead(403);
			res.end("cross-origin request rejected");
			return;
		}
		res.writeHead(200);
		res.end("ok");
	},
	"/good/csrf-token": async (req, res) => {
		if (req.method !== "GET" && req.headers["x-csrf-token"] !== "tok123") {
			res.writeHead(403);
			res.end("bad token");
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html", "X-CSRF-Token": "tok123" });
		res.end(html("ok"));
	},
	"/good/csrf-token-redirect-login": async (req, res) => {
		// Token-protected, and unauthenticated requests are redirected to /login.
		if (!hasSession(req)) {
			res.writeHead(302, { Location: "/login" });
			res.end();
			return;
		}
		if (req.method !== "GET" && req.headers["x-csrf-token"] !== "tok123") {
			res.writeHead(403);
			res.end();
			return;
		}
		res.writeHead(200, { "Content-Type": "text/html", "X-CSRF-Token": "tok123" });
		res.end(html("ok"));
	},

	// ---------------------------------------------------------------- CORS
	"/vuln/cors-reflect-any": (req, res) => {
		res.writeHead(200, {
			"Access-Control-Allow-Origin": req.headers.origin ?? "",
			"Access-Control-Allow-Credentials": "true",
		});
		res.end("{}");
	},
	"/vuln/cors-substring-match": (req, res) => {
		// Buggy allowlist: origin.includes(ownHost) — matches localhost.evil.com etc.
		const origin = req.headers.origin ?? "";
		const h: Record<string, string> = {};
		if (origin.includes("localhost")) {
			h["Access-Control-Allow-Origin"] = origin;
			h["Access-Control-Allow-Credentials"] = "true";
		}
		res.writeHead(200, h);
		res.end("{}");
	},
	"/vuln/cors-get-only": (req, res) => {
		// Reflects on actual requests only; no preflight handler (OPTIONS 404).
		if (req.method === "OPTIONS") {
			res.writeHead(404);
			res.end();
			return;
		}
		res.writeHead(200, {
			"Access-Control-Allow-Origin": req.headers.origin ?? "",
			"Access-Control-Allow-Credentials": "true",
			"Content-Type": "application/json",
		});
		res.end("{}");
	},
	"/good/cors-allowlist": (req, res) => {
		const origin = req.headers.origin ?? "";
		const h: Record<string, string> = { Vary: "Origin" };
		if (origin === "https://app.example.com") {
			h["Access-Control-Allow-Origin"] = origin;
			h["Access-Control-Allow-Credentials"] = "true";
		}
		res.writeHead(200, h);
		res.end("{}");
	},
};

export interface FixtureApp {
	server: Server;
	url: string;
	reset(): void;
}

export async function startFixtureApp(): Promise<FixtureApp> {
	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
		const body = await readBody(req);
		const handler = routes[url.pathname];
		if (!handler) {
			res.writeHead(404);
			res.end("not found");
			return;
		}
		await handler(req, res, url, body);
	});
	await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
	const port = (server.address() as AddressInfo).port;
	return {
		server,
		url: `http://localhost:${port}`,
		reset: () => {
			comments.length = 0;
		},
	};
}
