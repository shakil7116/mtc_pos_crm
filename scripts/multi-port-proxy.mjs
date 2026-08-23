/**
 * Lightweight multi-port proxy for testing cross-role workflows.
 *
 * Runs a single Node process that listens on ports 5051-5057 and proxies
 * every request to the main server on 5050. Each port gets its own
 * cookie namespace (mtc_token_5051, etc.) so browser sessions don't collide.
 *
 * Memory: ~30MB total vs ~300MB per Vite instance.
 *
 * Usage:  node scripts/multi-port-proxy.mjs
 */

import http from "node:http";

const TARGET = { hostname: "127.0.0.1", port: 5050 };
const PORTS = [5051, 5052, 5053, 5054, 5055, 5056, 5057];
const COOKIE_BASE = "mtc_token";

function rewriteCookieIn(headers, fromPort) {
  // Browser sends "mtc_token_5051=xxx" — rewrite to "mtc_token=xxx" for the backend
  const raw = headers.cookie;
  if (!raw) return;
  const portCookie = `${COOKIE_BASE}_${fromPort}`;
  headers.cookie = raw.replace(new RegExp(portCookie, "g"), COOKIE_BASE);
}

function rewriteSetCookieOut(headers, fromPort) {
  // Backend sends "Set-Cookie: mtc_token=xxx" — rewrite to "mtc_token_5051=xxx"
  let sc = headers["set-cookie"];
  if (!sc) return;
  if (!Array.isArray(sc)) sc = [sc];
  const portCookie = `${COOKIE_BASE}_${fromPort}`;
  headers["set-cookie"] = sc.map(c => c.replace(COOKIE_BASE, portCookie));
}

function createProxy(listenPort) {
  const server = http.createServer((req, res) => {
    // Rewrite incoming cookie name so the backend sees mtc_token
    const hdrs = { ...req.headers, host: `localhost:${TARGET.port}` };
    rewriteCookieIn(hdrs, listenPort);

    const proxyReq = http.request(
      {
        hostname: TARGET.hostname,
        port: TARGET.port,
        path: req.url,
        method: req.method,
        headers: hdrs,
      },
      (proxyRes) => {
        // Rewrite outgoing Set-Cookie so the browser stores mtc_token_5051
        const outHeaders = { ...proxyRes.headers };
        rewriteSetCookieOut(outHeaders, listenPort);
        res.writeHead(proxyRes.statusCode || 200, outHeaders);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", () => {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Main server (port ${TARGET.port}) unavailable`);
    });

    req.pipe(proxyReq);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`  [SKIP] Port ${listenPort} already in use`);
    } else {
      console.error(`  [ERR]  Port ${listenPort}: ${err.message}`);
    }
  });

  server.listen(listenPort, "0.0.0.0", () => {
    console.log(`  [OK]   Port ${listenPort} → proxying to ${TARGET.port} (cookie: ${COOKIE_BASE}_${listenPort})`);
  });

  return server;
}

console.log("\n=== MTC Multi-Port Proxy ===");
console.log(`Backend: localhost:${TARGET.port}`);
console.log(`Ports:   ${PORTS.join(", ")}\n`);

const servers = PORTS.map(createProxy);

process.on("SIGINT", () => {
  console.log("\nShutting down proxies...");
  servers.forEach(s => s.close());
  process.exit(0);
});

console.log("\nAll proxies starting. Each port has its own login session.");
console.log("Log in separately on each port to test cross-role workflows.\n");
