import { describe, it, expect, vi } from "vitest";
import { NAV_ACCESS, ROLES, ROLE_LABEL, normalizeRole, canAccess } from "../shared/permissions";
import { readOnlyGate } from "../server/middleware";

// The CEO is a viewer: universal like admin (never store-locked) but unable to
// change anything. The guarantee has to hold at the API, not in the menu — a
// hidden page is still one curl away.

describe("ceo is a real role", () => {
  it("exists and survives normalisation", () => {
    expect(ROLES).toContain("ceo");
    expect(normalizeRole("ceo")).toBe("ceo");
  });

  it("is labelled so nobody mistakes it for an editor", () => {
    expect(ROLE_LABEL.ceo).toMatch(/view/i);
  });

  it("does not fall back to salesman like an unknown role would", () => {
    expect(normalizeRole("ceo")).not.toBe("salesman");
    expect(normalizeRole("chairman")).toBe("salesman"); // unknown -> safe default
  });
});

describe("ceo sees the money and nothing else", () => {
  it("can reach the financial pages", () => {
    for (const page of ["dashboard", "finance", "reports"] as const) {
      expect(canAccess("ceo", page), `ceo should reach ${page}`).toBe(true);
    }
  });

  it("cannot reach the pages that create or change things", () => {
    for (const page of ["documents", "inventory", "settings", "approvals", "suppliers"] as const) {
      expect(canAccess("ceo", page), `ceo must NOT reach ${page}`).toBe(false);
    }
  });

  it("is never given settings — that is admin only", () => {
    expect(NAV_ACCESS.settings).toEqual(["admin"]);
  });
});

// ── the part that actually matters ──
function run(method: string, path: string, role: string) {
  const req: any = { method, path, user: { role } };
  const res: any = {
    statusCode: 0, body: null,
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; return this; },
  };
  const next = vi.fn();
  readOnlyGate(req, res, next);
  return { res, next, blocked: !next.mock.calls.length };
}

describe("readOnlyGate — a viewer cannot write, whatever route they find", () => {
  it("lets a ceo read", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) {
      expect(run(m, "/api/documents", "ceo").blocked, `${m} should pass`).toBe(false);
    }
  });

  it("blocks every kind of write", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const { blocked, res } = run(m, "/api/documents", "ceo");
      expect(blocked, `${m} must be refused`).toBe(true);
      expect(res.statusCode).toBe(403);
    }
  });

  it("blocks writes to routes that do not exist yet", () => {
    // The whole point of gating centrally: a route added next month is covered
    // without anyone remembering to guard it.
    expect(run("POST", "/api/some-future-endpoint", "ceo").blocked).toBe(true);
  });

  it("explains itself rather than just saying no", () => {
    const { res } = run("POST", "/api/documents", "ceo");
    expect(String(res.body?.message)).toMatch(/cannot change/i);
  });

  it("still lets a ceo manage their OWN login", () => {
    for (const p of ["/api/auth/logout", "/api/auth/change-password", "/api/auth/change-pin"]) {
      expect(run("POST", p, "ceo").blocked, `${p} should be allowed`).toBe(false);
    }
  });

  it("does not touch non-API traffic", () => {
    expect(run("POST", "/login", "ceo").blocked).toBe(false);
  });
});

describe("readOnlyGate leaves every other role alone", () => {
  it("does not block admin, manager, salesman, worker or driver", () => {
    for (const role of ["admin", "manager", "salesman", "worker", "driver"]) {
      expect(run("POST", "/api/documents", role).blocked, `${role} must not be blocked`).toBe(false);
      expect(run("DELETE", "/api/documents/1", role).blocked).toBe(false);
    }
  });

  it("does not block an unauthenticated request — that is apiAuthGate's job", () => {
    const req: any = { method: "POST", path: "/api/documents", user: undefined };
    const res: any = { status() { return this; }, json() { return this; } };
    const next = vi.fn();
    readOnlyGate(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
