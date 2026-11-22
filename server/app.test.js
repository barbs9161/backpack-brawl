import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { createLeaderboardStore } from "./leaderboard.js";
import { opponentForRound } from "./opponents.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const run = (changes = {}) => ({ runId: id(1), playerName: "Hero", wins: 5, lives: 3, rounds: 5, ...changes });

describe("Express API", () => {
  let server;
  let baseUrl;
  let store;

  beforeEach(async () => {
    vi.stubEnv("API_FAIL", "false");
    vi.stubEnv("API_LATENCY", "0");
    store = createLeaderboardStore();
    server = createApp({ leaderboardStore: store }).listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const post = (body) => fetch(`${baseUrl}/api/leaderboard`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  it("returns an empty leaderboard initially", async () => {
    const response = await fetch(`${baseUrl}/api/leaderboard`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [] });
  });

  it.each([
    [run(), "victory"],
    [run({ wins: 2, lives: 0, rounds: 5 }), "defeat"],
  ])("accepts a valid finished run as %s", async (submission, outcome) => {
    const response = await post({ ...submission, playerName: " Hero ", outcome: "untrusted" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ entry: { ...submission, outcome, createdAt: expect.any(String) } });
  });

  it("retrieves saved entries in ranking order", async () => {
    for (const submission of [
      run({ runId: id(4), wins: 1, lives: 0, rounds: 4 }),
      run({ runId: id(3), wins: 4, lives: 0, rounds: 7 }),
      run({ runId: id(2), lives: 1, rounds: 7 }),
      run(),
    ]) expect((await post(submission)).status).toBe(201);
    const response = await fetch(`${baseUrl}/api/leaderboard`);
    expect(response.status).toBe(200);
    const { entries } = await response.json();
    expect(entries.map((entry) => entry.runId)).toEqual([id(1), id(2), id(3), id(4)]);
  });

  it("returns the original entry and 200 for a normalized duplicate", async () => {
    const first = await post(run({ runId: "ABCDEFAB-1234-4ABC-8ABC-123456789ABC" }));
    const original = await first.json();
    const retry = await post(run({ runId: "abcdefab-1234-4abc-8abc-123456789abc", playerName: " Hero " }));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(original);
    expect(store.list()).toHaveLength(1);
  });

  it("rejects conflicting data with 409 without replacing the original", async () => {
    const original = await (await post(run())).json();
    const response = await post(run({ playerName: "Other" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This run has already been submitted with different data." });
    expect(store.list()).toEqual([original.entry]);
  });

  it.each([
    [null, /valid JSON/],
    [[], /non-null object/],
    [{}, /UUID/],
    [run({ playerName: " " }), /name/],
    [run({ wins: "5" }), /wins/],
    [run({ wins: 4, lives: 2, rounds: 5 }), /finished/],
    [run({ lives: 2, rounds: 5 }), /Rounds/],
  ])("returns readable JSON 400 for invalid submission %j", async (submission, message) => {
    const response = await post(submission);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: expect.stringMatching(message) });
    expect(store.list()).toEqual([]);
  });

  it("returns JSON 400 for malformed JSON", async () => {
    const response = await fetch(`${baseUrl}/api/leaderboard`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"runId":',
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Request body must contain valid JSON." });
  });

  it("hides unexpected internal errors", async () => {
    vi.spyOn(store, "list").mockImplementation(() => { throw new Error("secret stack detail"); });
    const response = await fetch(`${baseUrl}/api/leaderboard`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "An unexpected server error occurred." });
  });

  it("preserves the health endpoint", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "backpack-brawl" });
  });

  it.each([1, 7, 8])("preserves opponent selection for round %i", async (round) => {
    const response = await fetch(`${baseUrl}/api/opponents?round=${round}&latency=0`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(opponentForRound(round));
  });

  it.each(["", "round=0&", "round=1.5&", "round=abc&"])("preserves invalid-round errors: %s", async (query) => {
    const response = await fetch(`${baseUrl}/api/opponents?${query}latency=0&fail=true`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "round must be a positive whole number" });
  });

  it.each(["query", "environment"])("preserves forced opponent failures through %s", async (mode) => {
    if (mode === "environment") vi.stubEnv("API_FAIL", "true");
    const response = await fetch(`${baseUrl}/api/opponents?round=1&latency=0${mode === "query" ? "&fail=true" : ""}`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The arena gates are shut. No challenger answered the call." });
  });
});
