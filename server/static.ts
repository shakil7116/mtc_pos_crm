import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // The service worker must never be cached. A browser holding an old copy keeps
  // running it, so a bad worker could outlive the deploy that fixed it. Same for
  // the manifest, which is cheap and changes rarely.
  app.use((req, res, next) => {
    if (req.path === "/sw.js" || req.path === "/manifest.webmanifest") {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
    next();
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
