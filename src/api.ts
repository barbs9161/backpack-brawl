import type { LeaderboardEntry, LeaderboardSubmission, Opponent } from "./types";
import { isOpponent } from "./opponent";

export const OPPONENT_TIMEOUT_MS = 8000;

/** Asks the API for this round's opponent; throws with the server's error text on failure. */
export async function fetchOpponent(round: number, signal?: AbortSignal): Promise<Opponent> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, OPPONENT_TIMEOUT_MS);
  try {
    const response = await fetch(`/api/opponents?round=${encodeURIComponent(round)}`, { signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) throw new Error('Opponent search cancelled.');
    if (!response.ok) {
      throw new Error(isRecord(body) && typeof body.error === 'string' && body.error.trim()
        ? body.error : `Opponent search failed (${response.status}). Please try again.`);
    }
    if (!isOpponent(body) || body.round !== round) throw new Error('Invalid opponent response for this round. Please try again.');
    return body;
  } catch (error) {
    if (timedOut) throw new Error('Opponent search timed out after 8 seconds. Please try again.', { cause: error });
    if (signal?.aborted) throw new Error('Opponent search cancelled.', { cause: error });
    if (error instanceof TypeError) throw new Error('Unable to reach the opponent API. Please try again.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate response fields at the HTTP boundary rather than trusting a cast. */
function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!isRecord(value)) return false;
  return typeof value.runId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.runId)
    && typeof value.playerName === "string" && value.playerName === value.playerName.trim()
    && Array.from(value.playerName).length >= 1 && Array.from(value.playerName).length <= 30
    && !/\p{Cc}/u.test(value.playerName)
    && typeof value.wins === "number" && Number.isInteger(value.wins) && value.wins >= 0 && value.wins <= 5
    && typeof value.lives === "number" && Number.isInteger(value.lives) && value.lives >= 0 && value.lives <= 3
    && typeof value.rounds === "number" && Number.isInteger(value.rounds) && value.rounds >= 3 && value.rounds <= 7
    && value.rounds === value.wins + (3 - value.lives)
    && ((value.outcome === "victory" && value.wins === 5 && value.lives > 0)
      || (value.outcome === "defeat" && value.lives === 0 && value.wins < 5))
    && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt));
}

async function readLeaderboardResponse(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" && body.error.trim()
      ? body.error : `Leaderboard request failed (${response.status})`;
    // Preserve HTTP status so a definite validation rejection can be corrected;
    // network/5xx/invalid-success outcomes may already have stored the entry.
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body;
}

export async function submitLeaderboardRun(submission: LeaderboardSubmission): Promise<LeaderboardEntry> {
  const response = await fetch("/api/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  });
  const body = await readLeaderboardResponse(response);
  if (!isRecord(body) || !isLeaderboardEntry(body.entry)
    || body.entry.runId !== submission.runId.toLowerCase()
    || body.entry.playerName !== submission.playerName.trim()
    || body.entry.wins !== submission.wins || body.entry.lives !== submission.lives
    || body.entry.rounds !== submission.rounds) {
    throw new Error("Invalid leaderboard submission response.");
  }
  return body.entry;
}

export async function fetchLeaderboard(signal?: AbortSignal): Promise<LeaderboardEntry[]> {
  const response = await fetch("/api/leaderboard", { signal });
  const body = await readLeaderboardResponse(response);
  if (!isRecord(body) || !Array.isArray(body.entries) || !body.entries.every(isLeaderboardEntry)) {
    throw new Error("Invalid leaderboard response.");
  }
  return body.entries;
}
