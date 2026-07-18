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
