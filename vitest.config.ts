import { defineConfig } from "vitest/config";
import path from "path";

// Deliberately NOT reusing vite.config.ts — that one sets root to ./client,
// which would scope test discovery to the client folder only.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client/src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    reporters: "default",
  },
});
