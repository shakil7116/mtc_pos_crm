import { describe, it, expect } from "vitest";
import { pinProblem, isAcceptablePin, PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "../shared/pin";
import { hashPin, pinMatches } from "../server/pin";

// A PIN approves a discount at the counter AND, through "Forgot password?", lets
// someone set a new password on that account. It used to be stored as plain
// digits, so anyone who could read the database could take over any account, and
// anyone who watched a manager type it could do the same. It is a credential now
// and is treated like one.

describe("what counts as an acceptable PIN", () => {
  it("takes 4 to 6 digits", () => {
    expect(pinProblem("4917")).toBeNull();
    expect(pinProblem("83046")).toBeNull();
    expect(pinProblem("602815")).toBeNull();
    expect(PIN_MIN_LENGTH).toBe(4);
    expect(PIN_MAX_LENGTH).toBe(6);
  });

  it("refuses anything too short or too long", () => {
    expect(pinProblem("917")).toMatch(/4 to 6 digits/);
    expect(pinProblem("6028157")).toMatch(/4 to 6 digits/);
    expect(pinProblem("")).toMatch(/4 to 6 digits/);
  });

  it("refuses anything that is not digits", () => {
    expect(pinProblem("49a7")).toMatch(/4 to 6 digits/);
    expect(pinProblem("49 7")).toMatch(/4 to 6 digits/);
    expect(pinProblem("-917")).toMatch(/4 to 6 digits/);
  });

  it("refuses the PINs a shoulder-surfer guesses first", () => {
    for (const weak of ["1234", "12345", "123456", "4321", "54321", "654321"]) {
      expect(pinProblem(weak), weak).toMatch(/less obvious/);
    }
  });

  it("refuses the same digit repeated", () => {
    expect(pinProblem("1111")).toMatch(/less obvious/);
    expect(pinProblem("000000")).toMatch(/less obvious/);
  });

  it("trims surrounding space rather than rejecting it", () => {
    expect(pinProblem("  4917  ")).toBeNull();
  });

  it("isAcceptablePin agrees with pinProblem", () => {
    expect(isAcceptablePin("4917")).toBe(true);
    expect(isAcceptablePin("1234")).toBe(false);
  });
});

describe("a stored PIN cannot be read back", () => {
  it("the stored value is not the PIN", () => {
    const stored = hashPin("4917");
    expect(stored).not.toBe("4917");
    expect(stored).not.toContain("4917");
  });

  it("the same PIN hashes differently every time, so two people sharing one is not visible", () => {
    expect(hashPin("4917")).not.toBe(hashPin("4917"));
  });

  it("matches the right PIN and rejects the wrong one", () => {
    const stored = hashPin("4917");
    expect(pinMatches("4917", stored)).toBe(true);
    expect(pinMatches("4918", stored)).toBe(false);
    expect(pinMatches("", stored)).toBe(false);
  });

  it("an account with no PIN stored can never be opened by guessing", () => {
    expect(pinMatches("4917", null)).toBe(false);
    expect(pinMatches("4917", undefined)).toBe(false);
    expect(pinMatches("", null)).toBe(false);
    expect(pinMatches("", "")).toBe(false);
  });

  it("ignores surrounding space the same way on the way in and out", () => {
    expect(pinMatches("  4917 ", hashPin("4917"))).toBe(true);
    expect(pinMatches("4917", hashPin(" 4917  "))).toBe(true);
  });
});
