import { describe, it, expect } from "vitest";
import {
  normalizeUsername, suggestUsername, usernameProblem, emailProblem,
  ownerAccountProblem, USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH,
} from "../shared/setup";
import { passwordProblem, isAcceptablePassword, PASSWORD_MIN_LENGTH } from "../shared/password";

// A fresh copy of this app has no accounts at all. Somebody has to walk up to it
// once and become the owner, and the thing that went wrong the first time was not
// the account — it was that the owner was never told the username the login screen
// would ask them for. These are the rules the setup screen and the server BOTH run,
// from the same functions, so the screen can never accept something the server then
// rejects with the password fields already wiped.

describe("turning what the owner typed into a username", () => {
  it("lowercases and drops anything that is not allowed", () => {
    expect(normalizeUsername("  Shakil ")).toBe("shakil");
    expect(normalizeUsername("Shakil Gazi")).toBe("shakilgazi");
    expect(normalizeUsername("SH@KIL!")).toBe("shkil");
    expect(normalizeUsername("a.b-c_d")).toBe("a.b-c_d");
  });

  it("suggests one from the email, and falls back to the name", () => {
    expect(suggestUsername("shakil@mtc.qa")).toBe("shakil");
    expect(suggestUsername("Shakil.Gazi@mtc.qa")).toBe("shakil.gazi");
    expect(suggestUsername("Shakil Gazi")).toBe("shakil");
    expect(suggestUsername("")).toBe("");
  });

  it("never suggests something longer than a username may be", () => {
    expect(suggestUsername("a".repeat(80) + "@mtc.qa").length).toBe(USERNAME_MAX_LENGTH);
  });
});

describe("what counts as an acceptable username", () => {
  it("accepts an ordinary one", () => {
    expect(usernameProblem("shakil")).toBeNull();
    expect(usernameProblem("store_2.manager")).toBeNull();
  });

  it("refuses spaces and capitals — the two things people mistype at a counter", () => {
    expect(usernameProblem("shakil gazi")).toMatch(/spaces/);
    expect(usernameProblem("Shakil")).toMatch(/lowercase/);
  });

  it("refuses empty, too short, too long, and odd characters", () => {
    expect(usernameProblem("")).toMatch(/Choose a username/);
    expect(usernameProblem("ab")).toMatch(new RegExp(`${USERNAME_MIN_LENGTH} characters`));
    expect(usernameProblem("a".repeat(USERNAME_MAX_LENGTH + 1))).toMatch(new RegExp(`${USERNAME_MAX_LENGTH} characters`));
    expect(usernameProblem("shakil@mtc")).toMatch(/letters, numbers/);
  });
});

describe("email", () => {
  it("wants something that is actually an address", () => {
    expect(emailProblem("shakil@mtc.qa")).toBeNull();
    expect(emailProblem("")).toMatch(/Enter an email/);
    expect(emailProblem("shakil")).toMatch(/valid email/);
    expect(emailProblem("shakil@mtc")).toMatch(/valid email/);
    expect(emailProblem("shakil @mtc.qa")).toMatch(/valid email/);
  });
});

describe("password rules — the same ones for the owner as for everyone else", () => {
  it("accepts letters plus numbers, at least the minimum length", () => {
    expect(passwordProblem("Doha2026build")).toBeNull();
    expect(isAcceptablePassword("Doha2026build")).toBe(true);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("refuses short, all-letter, all-number and well-known passwords", () => {
    expect(passwordProblem("abc123")).toMatch(/at least 8/);
    expect(passwordProblem("passwordonly")).toMatch(/letters and numbers/);
    expect(passwordProblem("948273615")).toMatch(/letters and numbers/);
    expect(passwordProblem("test123")).toMatch(/at least 8/);      // short AND common
    expect(passwordProblem("admin123")).toMatch(/too common/);
    expect(passwordProblem("Password1")).toMatch(/too common/);    // case does not save it
  });

  it("refuses a password that is just the username", () => {
    expect(passwordProblem("shakil2026", "shakil2026")).toMatch(/different from the username/);
    expect(passwordProblem("Shakil2026", "shakil2026")).toMatch(/different from the username/);
  });
});

describe("the whole first-admin form", () => {
  const good = {
    name: "Shakil Gazi",
    email: "shakil@mtc.qa",
    username: "shakil",
    password: "Doha2026build",
    confirmPassword: "Doha2026build",
  };

  it("passes a complete, sane account", () => {
    expect(ownerAccountProblem(good)).toBeNull();
  });

  it("reports the first problem, reading down the form", () => {
    expect(ownerAccountProblem({ ...good, name: "  " })).toMatch(/full name/);
    expect(ownerAccountProblem({ ...good, email: "nope" })).toMatch(/valid email/);
    expect(ownerAccountProblem({ ...good, username: "no" })).toMatch(/at least 3/);
    expect(ownerAccountProblem({ ...good, password: "short1" })).toMatch(/at least 8/);
  });

  it("checks the repeat only when the screen sends one", () => {
    expect(ownerAccountProblem({ ...good, confirmPassword: "Doha2026built" })).toMatch(/don't match/);
    // The server never receives a confirm field — its absence must not fail.
    const { confirmPassword, ...serverSide } = good;
    expect(ownerAccountProblem(serverSide)).toBeNull();
  });

  it("refuses an account with nothing filled in at all", () => {
    expect(ownerAccountProblem({})).toMatch(/full name/);
  });
});
