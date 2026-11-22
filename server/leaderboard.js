const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER = /\p{Cc}/u;

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

/** Returns normalized finished-run data, or throws an Error with status 400. */
export function validateSubmission(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    invalid("Submission must be a non-null object.");
  }
  if (typeof body.runId !== "string" || !UUID.test(body.runId)) {
    invalid("runId must be a valid UUID.");
  }
  if (typeof body.playerName !== "string") invalid("Player name must be a string.");
  if (CONTROL_CHARACTER.test(body.playerName)) invalid("Player name must not contain control characters.");
  const playerName = body.playerName.trim();
  if (Array.from(playerName).length < 1 || Array.from(playerName).length > 30) {
    invalid("Player name must contain between 1 and 30 characters after trimming.");
  }
  for (const [field, min, max] of [["wins", 0, 5], ["lives", 0, 3], ["rounds", 3, 7]]) {
    if (!Number.isInteger(body[field]) || body[field] < min || body[field] > max) {
      invalid(`${field} must be an integer between ${min} and ${max}.`);
    }
  }
  let outcome;
  if (body.wins === 5 && body.lives >= 1) outcome = "victory";
  else if (body.lives === 0 && body.wins <= 4) outcome = "defeat";
  else invalid("Run must be finished: victory needs 5 wins and remaining lives; defeat needs 0 lives and fewer than 5 wins.");
  if (body.rounds !== body.wins + (3 - body.lives)) {
    invalid("Rounds must equal wins plus lost lives (3 minus remaining lives).");
  }
  return { runId: body.runId.toLowerCase(), playerName, wins: body.wins, lives: body.lives, rounds: body.rounds, outcome };
}

/** Ranking ends with UUID order so equal timestamps still have a stable order. */
export function compareEntries(a, b) {
  return Number(b.outcome === "victory") - Number(a.outcome === "victory")
    || b.wins - a.wins
    || a.rounds - b.rounds
    || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
    || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);
}

/** Process-local storage. All returned entries are copies of the stored values. */
export function createLeaderboardStore() {
  const entries = new Map();
  return {
    submit(body) {
      const submission = validateSubmission(body);
      const existing = entries.get(submission.runId);
      if (existing) {
        if (Object.keys(submission).some((field) => existing[field] !== submission[field])) {
          const error = new Error("This run has already been submitted with different data.");
          error.status = 409;
          throw error;
        }
        return { ...existing };
      }
      const entry = { ...submission, createdAt: new Date().toISOString() };
      entries.set(entry.runId, entry);
      return { ...entry };
    },
    list() {
      return [...entries.values()].sort(compareEntries).map((entry) => ({ ...entry }));
    },
  };
}
