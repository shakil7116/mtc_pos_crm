import type { Request, Response, NextFunction, RequestHandler } from "express";

/** Standard JSON error body — always includes `error` for clients and `message` for backward compat. */
export function jsonError(
  res: Response,
  status: number,
  error: string,
  extra?: Record<string, unknown>,
) {
  return res.status(status).json({
    error,
    message: error,
    statusCode: status,
    ...extra,
  });
}

/** CORS for local dev — single-server (5050) and split Vite ports. */
export const corsMiddleware: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  const isDev = process.env.NODE_ENV !== "production";

  if (origin) {
    const allowed =
      origin === process.env.CLIENT_ORIGIN ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      (isDev && /^https?:\/\/[\w.-]+(:\d+)?$/.test(origin));

    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
};

/** Wrap async route handlers so rejected promises reach the global error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Catch-all for unmatched /api routes — prevents HTML responses on API calls. */
export const apiNotFoundHandler: RequestHandler = (req, res) => {
  jsonError(res, 404, `API route not found: ${req.method} ${req.originalUrl}`, {
    path: req.originalUrl,
  });
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(err);
  }

  // Malformed JSON body
  if (err instanceof SyntaxError && "body" in err) {
    return jsonError(res, 400, "Invalid JSON in request body");
  }

  const e = err as { status?: number; statusCode?: number; message?: string; code?: string };
  const status = e.status || e.statusCode || 500;
  const message =
    e.message ||
    (err instanceof Error ? err.message : null) ||
    "Internal Server Error";

  if (status >= 500) {
    console.error("Internal Server Error:", err);
  }

  return jsonError(res, status, message, e.code ? { code: e.code } : undefined);
}
