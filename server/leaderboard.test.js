import { afterEach, describe, expect, it, vi } from "vitest";
import { compareEntries, createLeaderboardStore, validateSubmission } from "./leaderboard.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const run = (changes = {}) => ({ runId: id(1), playerName: "Hero", wins: 5, lives: 3, rounds: 5, ...changes });

afterEach(() => vi.useRealTimers());

describe("validateSubmission", () => {
  it.each([
    [5, 3, 5, "victory"], [5, 2, 6, "victory"], [5, 1, 7, "victory"],
    [0, 0, 3, "defeat"], [1, 0, 4, "defeat"], [2, 0, 5, "defeat"],
    [3, 0, 6, "defeat"], [4, 0, 7, "defeat"],
  ])("accepts %i wins, %i lives, %i rounds as %s", (wins, lives, rounds, outcome) => {
    expect(validateSubmission(run({ wins, lives, rounds, outcome: "untrusted" })).outcome).toBe(outcome);
  });

  it("normalizes names and UUID case without mutating input", () => {
    const body = run({ playerName: "  Ada  ", runId: "ABCDEFAB-1234-4ABC-8ABC-123456789ABC" });
    expect(validateSubmission(body)).toMatchObject({ playerName: "Ada", runId: body.runId.toLowerCase() });
    expect(body.playerName).toBe("  Ada  ");
  });

  it.each(["A", "A".repeat(30), "😀".repeat(30)])("accepts name boundaries: %s", (playerName) => {
    expect(validateSubmission(run({ playerName })).playerName).toBe(playerName);
  });

  it.each([null, undefined, [], "body", 42, true])("rejects invalid body %j", (body) => {
    expect(() => validateSubmission(body)).toThrow("Submission must be a non-null object");
  });

  it.each([undefined, 123, "", "not-a-uuid", "00000000-0000-0000-0000-000000000000", "00000000-0000-4000-7000-000000000001"])("rejects UUID %j", (runId) => {
    expect(() => validateSubmission(run({ runId }))).toThrow("valid UUID");
  });

  it.each([undefined, 42, "", "   ", "A".repeat(31), "A\nB", "\tHero", "A\u0000B", "A\u007fB", "A\u0085B"])("rejects name %j", (playerName) => {
    expect(() => validateSubmission(run({ playerName }))).toThrow(/name/i);
  });

  for (const [field, min, max] of [["wins", 0, 5], ["lives", 0, 3], ["rounds", 3, 7]]) {
    it.each([undefined, null, "3", true, NaN, Infinity, 1.5, min - 1, max + 1])(`rejects invalid ${field}: %j`, (value) => {
      expect(() => validateSubmission(run({ [field]: value }))).toThrow(`${field} must be an integer`);
    });
  }

  it.each([
    { wins: 4, lives: 2, rounds: 5 },
    { wins: 5, lives: 0, rounds: 7 },
    { wins: 0, lives: 3, rounds: 3 },
  ])("rejects unfinished or impossible terminal statistics %j", (stats) => {
    expect(() => validateSubmission(run(stats))).toThrow("Run must be finished");
  });

  it.each([{ wins: 5, lives: 2, rounds: 5 }, { wins: 0, lives: 0, rounds: 4 }])("rejects inconsistent rounds %j", (stats) => {
    expect(() => validateSubmission(run(stats))).toThrow("Rounds must equal wins plus lost lives");
  });

  it("reports status 400 for validation errors", () => {
    expect(() => validateSubmission(null)).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe("compareEntries", () => {
  const entry = (changes = {}) => ({ ...validateSubmission(run()), createdAt: "2026-01-01T00:00:00.000Z", ...changes });

  it.each([
    [entry(), entry({ outcome: "defeat", wins: 4, lives: 0, rounds: 7 })],
    [entry({ outcome: "defeat", wins: 4, rounds: 7 }), entry({ outcome: "defeat", wins: 3, rounds: 6 })],
    [entry(), entry({ lives: 2, rounds: 6 })],
    [entry(), entry({ createdAt: "2026-01-02T00:00:00.000Z" })],
    [entry(), entry({ runId: id(2) })],
  ])("applies each ranking priority", (first, second) => {
    expect(compareEntries(first, second)).toBeLessThan(0);
    expect(compareEntries(second, first)).toBeGreaterThan(0);
  });

  it("returns zero for identical entries", () => {
    expect(compareEntries(entry(), entry())).toBe(0);
  });
});

describe("createLeaderboardStore", () => {
  it("starts empty and stores the expected fields", () => {
    const store = createLeaderboardStore();
    expect(store.list()).toEqual([]);
    const entry = store.submit(run());
    expect(entry).toEqual({ ...validateSubmission(run()), createdAt: expect.any(String) });
    expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
    expect(store.list()).toEqual([entry]);
  });

  it("returns the original entry for normalized duplicates without updating its timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const store = createLeaderboardStore();
    const first = store.submit(run({ playerName: " Ada " }));
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    expect(store.submit(run({ playerName: "Ada", outcome: "defeat" }))).toEqual(first);
    expect(store.list()).toHaveLength(1);
  });

  it.each([
    { playerName: "Other" }, { lives: 2, rounds: 6 }, { wins: 2, lives: 0, rounds: 5 },
  ])("rejects conflicting normalized data %j", (changes) => {
    const store = createLeaderboardStore();
    const first = store.submit(run());
    expect(() => store.submit(run(changes))).toThrow(expect.objectContaining({ status: 409, message: "This run has already been submitted with different data." }));
    expect(store.list()).toEqual([first]);
  });

  it("does not store invalid submissions", () => {
    const store = createLeaderboardStore();
    expect(() => store.submit(run({ wins: 6 }))).toThrow();
    expect(store.list()).toEqual([]);
  });

  it("returns sorted entries, using UUID order for equal timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const store = createLeaderboardStore();
    store.submit(run({ runId: id(4), wins: 3, lives: 0, rounds: 6 }));
    store.submit(run({ runId: id(3), lives: 2, rounds: 6 }));
    store.submit(run({ runId: id(2) }));
    store.submit(run());
    expect(store.list().map((entry) => entry.runId)).toEqual([id(1), id(2), id(3), id(4)]);
  });

  it("ranks earlier acceptance first when other statistics match", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const store = createLeaderboardStore();
    store.submit(run({ runId: id(2) }));
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    store.submit(run());
    expect(store.list().map((entry) => entry.runId)).toEqual([id(2), id(1)]);
  });

  it("protects stored data from input, submit, duplicate, and list mutations", () => {
    const store = createLeaderboardStore();
    const body = run();
    const accepted = store.submit(body);
    const expected = { ...accepted };
    body.playerName = "Changed input";
    accepted.playerName = "Changed return";
    const duplicate = store.submit(run());
    duplicate.wins = 0;
    const listed = store.list();
    listed[0].playerName = "Changed list";
    listed.push({});
    expect(store.list()).toEqual([expected]);
  });

  it("keeps store instances independent", () => {
    const first = createLeaderboardStore();
    first.submit(run());
    expect(createLeaderboardStore().list()).toEqual([]);
  });
});
