import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Send the httpOnly JWT cookie with every same-origin /api request. Role/identity
// come from the verified token on the server — the client no longer sends any
// role header (that was spoofable; Phase 7 removed it).
const _fetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url && (url.startsWith("/api") || url.includes("/api/"))) {
    init = { credentials: "include", ...init };
  }
  return _fetch(input as any, init);
};

createRoot(document.getElementById("root")!).render(<App />);

// ── Installable app ─────────────────────────────────────────────────────────
// Registered in PRODUCTION ONLY. In dev a service worker sits between Vite and
// the browser and makes hot reload behave in ways that waste hours.
//
// The worker never caches /api — see client/public/sw.js. Stock, prices and
// balances must be live or someone sells stock that is gone.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Not fatal: the app works perfectly without it, it just will not install
      // or open offline.
      console.warn("Service worker registration failed:", err);
    });
  });
}
