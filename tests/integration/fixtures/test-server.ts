import type { Server } from "node:http";
import express from "express";

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function createTestServer(): express.Express {
	const app = express();
	app.use(express.urlencoded({ extended: true }));

	app.get("/secure", (_req, res) => {
		res.set({
			"Strict-Transport-Security": "max-age=63072000; includeSubDomains",
			"Content-Security-Policy": "default-src 'self'",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "DENY",
			"Referrer-Policy": "strict-origin-when-cross-origin",
			"Permissions-Policy": "geolocation=()",
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Resource-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		});
		res.cookie("session", "abc123", {
			httpOnly: true,
			secure: true,
			sameSite: "strict",
		});
		res.send("<html><body><h1>Secure page</h1></body></html>");
	});

	app.get("/insecure", (_req, res) => {
		res.set({ "X-Powered-By": "Express" });
		res.cookie("session", "abc123");
		res.cookie("auth_token", "xyz789");
		res.send("<html><body><h1>Insecure page</h1></body></html>");
	});

	app.get("/xss-vulnerable", (req, res) => {
		const query = String(req.query.q ?? "");
		res.send(`<html><body>
			<form action="/xss-vulnerable" method="get">
				<input name="q" id="search" value="${query}">
				<button type="submit">Search</button>
			</form>
			<p>Results for: ${query}</p>
		</body></html>`);
	});

	app.get("/xss-safe", (req, res) => {
		const query = escapeHtml(String(req.query.q ?? ""));
		res.send(`<html><body>
			<form action="/xss-safe" method="get">
				<input name="q" id="search" value="${query}">
				<button type="submit">Search</button>
			</form>
			<p>Results for: ${query}</p>
		</body></html>`);
	});

	app.get("/partial", (_req, res) => {
		res.set({
			"Strict-Transport-Security": "max-age=63072000",
			"X-Content-Type-Options": "nosniff",
		});
		res.cookie("session", "abc123", { httpOnly: true });
		res.send("<html><body><h1>Partial security</h1></body></html>");
	});

	return app;
}

export function startServer(port = 0): Promise<{ server: Server; url: string }> {
	return new Promise((resolve) => {
		const app = createTestServer();
		const server = app.listen(port, () => {
			const addr = server.address();
			const boundPort = typeof addr === "object" && addr ? addr.port : port;
			resolve({ server, url: `http://localhost:${boundPort}` });
		});
	});
}
