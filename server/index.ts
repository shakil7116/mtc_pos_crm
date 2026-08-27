import "dotenv/config"; // load .env before anything reads process.env
import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { checkDbConnection } from "./db";
import { createServer } from "http";
import { corsMiddleware, errorHandler, apiAuthGate, readOnlyGate } from "./middleware";
import { authMiddleware } from "./auth";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// gzip every compressible response (JS/CSS/JSON). Without this the client pulls the
// raw ~2MB bundle instead of ~560KB gzipped — the single biggest load-time lever.
app.use(compression());

// CORS first — clean preflight + cross-port dev without connection drops
app.use(corsMiddleware);

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
// JWT session: verifies the httpOnly cookie and attaches req.user.
// Role comes from the token — never from client headers (dev fallback only via ALLOW_DEV_HEADERS=1).
app.use(authMiddleware);
app.use(apiAuthGate);
// Viewer roles (ceo) are refused every write here, before any route runs.
app.use(readOnlyGate);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Probe the DB early so connection/auth problems print a clear message
  await checkDbConnection();

  await registerRoutes(httpServer, app);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  const viteProxy = process.env.VITE_PROXY;
  if (viteProxy) {
    // Lightweight mode: proxy frontend requests to the main Vite server.
    // Saves ~300MB per instance vs running a full Vite dev server.
    const http = await import("http");
    app.use((req, res) => {
      const proxyReq = http.request(
        { hostname: "127.0.0.1", port: Number(viteProxy), path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${viteProxy}` } },
        (proxyRes) => { res.writeHead(proxyRes.statusCode || 200, proxyRes.headers); proxyRes.pipe(res); },
      );
      proxyReq.on("error", () => res.status(502).send("Vite proxy unavailable"));
      req.pipe(proxyReq);
    });
  } else if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Global error handler — MUST be registered after all routes (including Vite)
  app.use(errorHandler);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);

  // Graceful handling of a busy port instead of an unhandled crash
  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n❌ Port ${port} is already in use (another server is still running).`);
      console.error(`   Free it and retry:`);
      console.error(`     npx kill-port ${port}        # cross-platform`);
      console.error(`   or run on another port:  PORT=5001 npm run dev\n`);
      process.exit(1);
    }
    console.error("HTTP server error:", err);
    process.exit(1);
  });

  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
