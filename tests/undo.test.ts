import { describe, it, expect } from "vitest";
import {
  UNDO_WINDOW_MS, undoDeadline, undoMsLeft, isUndoable, formatUndoLeft,
} from "@shared/undo";

/* The one-day undo window. The countdown on screen and the clean-up on the
   server both read these, so if they ever disagreed a location could be erased
   while the screen still offered to bring it back. */

const HOUR = 60 * 60 * 1000;
const T0 = new Date("2026-08-29T08:00:00Z");

describe("the undo window", () => {
  it("is one full day", () => {
    expect(UNDO_WINDOW_MS).toBe(24 * HOUR);
  });

  it("ends exactly one day after the delete", () => {
    expect(undoDeadline(T0)).toBe(T0.getTime() + 24 * HOUR);
  });

  it("accepts a Date, an ISO string or a timestamp — the server sends all three", () => {
    expect(undoDeadline(T0)).toBe(undoDeadline(T0.toISOString()));
    expect(undoDeadline(T0)).toBe(undoDeadline(T0.getTime()));
  });
});

describe("what is left", () => {
  it("counts down", () => {
    expect(undoMsLeft(T0, T0.getTime() + HOUR)).toBe(23 * HOUR);
  });

  it("never goes negative — once the day is up it is simply zero", () => {
    expect(undoMsLeft(T0, T0.getTime() + 40 * HOUR)).toBe(0);
  });

  it("is undoable right up to the deadline and not one moment after", () => {
    expect(isUndoable(T0, T0.getTime() + 24 * HOUR - 1)).toBe(true);
    expect(isUndoable(T0, T0.getTime() + 24 * HOUR)).toBe(false);
    expect(isUndoable(T0, T0.getTime() + 24 * HOUR + 1)).toBe(false);
  });

  it("treats a missing or unreadable date as not undoable, never as fresh", () => {
    expect(isUndoable(null)).toBe(false);
    expect(isUndoable(undefined)).toBe(false);
    expect(isUndoable("not a date")).toBe(false);
  });
});

describe("what the screen says", () => {
  it("shows hours and minutes while there is time", () => {
    expect(formatUndoLeft(T0, T0.getTime() + 20 * 60 * 1000)).toBe("23h 40m left");
  });

  it("drops the hours in the last hour", () => {
    expect(formatUndoLeft(T0, T0.getTime() + 23 * HOUR + 42 * 60 * 1000)).toBe("18m left");
  });

  it("does not pretend there is a minute left when there is not", () => {
    expect(formatUndoLeft(T0, T0.getTime() + 24 * HOUR - 30_000)).toBe("less than a minute left");
  });

  it("says so plainly once the day is up", () => {
    expect(formatUndoLeft(T0, T0.getTime() + 25 * HOUR)).toBe("time is up");
  });
});
