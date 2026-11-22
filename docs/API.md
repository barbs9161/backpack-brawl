# Backpack Brawl API

The local API starts in `server/index.js`, with injectable Express app creation in `server/app.js`. It listens on port 4200 (override with the `PORT` environment variable). During Vite development, `/api` is proxied to it, so the frontend uses relative URLs such as `/api/opponents?round=1`. All responses are JSON. Opponent answers remain deterministic. Leaderboard entries are stored only in memory for the lifetime of the server process.

## `GET /api/health`

Always answers immediately with status 200:

```json
{ "ok": true, "service": "backpack-brawl" }
```

## `GET /api/opponents`

Returns the opponent for one round of a run. The opponent table lives in `server/opponents.js`.

### Query parameters

| Parameter | Required | Meaning |
|---|---|---|
| `round` | yes | The 1-based round number. Must be a positive whole number written in digits (`1`, `2`, …). |
| `latency` | no | Response delay in milliseconds, clamped to 0–5000. Defaults to 1200. A value that is not a number falls back to the default. |
| `fail` | no | `fail=true` forces a 503 response (see below). |

### Success — 200

```json
{
  "id": "mossback-hermit",
  "name": "Mossback Hermit",
  "icon": "🐢",
  "hp": 25,
  "items": ["chipped-dagger", "pot-lid"],
  "round": 1
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable identifier of the opponent |
| `name` | string | Display name |
| `icon` | string | Emoji shown in the battle view |
| `hp` | number | Maximum (and starting) HP |
| `items` | string[] | Item ids from the catalog in `src/items.ts`; the same id may appear several times |
| `round` | number | The round this opponent was requested for (echoes `round`) |

The response matches the `Opponent` type in `src/types.ts`.

The answer is deterministic: the same `round` always returns the same opponent. There is one hand-built opponent per round for rounds 1–7. Every round past the table returns the last opponent with +6 HP per additional round. The table never needs more than 7 rounds (5 wins + 3 lives − 1), and an opponent never carries more than 6 items, the size of the player's 2×3 backpack.

### Errors

Every error response has the shape:

```json
{ "error": "human-readable explanation" }
```

| Status | When | `error` |
|---|---|---|
| 400 | `round` is missing, not a whole number, or less than 1 | `round must be a positive whole number` |
| 503 | `fail=true`, or the server was started with `API_FAIL=true` | `The arena gates are shut. No challenger answered the call.` |

An invalid `round` is reported as 400 even when failure is forced. All responses from this endpoint, errors included, arrive after the configured delay.

## `GET /api/leaderboard`

Returns all accepted entries, sorted by:

1. Victory before defeat.
2. Higher wins first.
3. Fewer rounds first.
4. Earlier acceptance time (`createdAt`) first.
5. Lexicographically smaller normalized `runId` first when timestamps are equal.

### Success — 200

```json
{
  "entries": [
    {
      "runId": "abcdefab-1234-4abc-8abc-123456789abc",
      "playerName": "Ada",
      "wins": 5,
      "lives": 2,
      "rounds": 6,
      "outcome": "victory",
      "createdAt": "2026-11-22T08:00:00.000Z"
    }
  ]
}
```

An empty leaderboard returns `200 { "entries": [] }`.

## `POST /api/leaderboard`

Accepts a finished run. Send `Content-Type: application/json`:

```json
{
  "runId": "abcdefab-1234-4abc-8abc-123456789abc",
  "playerName": "  Ada  ",
  "wins": 5,
  "lives": 2,
  "rounds": 6
}
```

### Validation and normalization

- The body must be a non-null object, not an array.
- `runId` must be a UUID with version 1–8 and the standard variant; it is normalized to lowercase.
- `playerName` must be a string without control characters. Surrounding whitespace is trimmed; the result must contain 1–30 Unicode code points.
- `wins` must be an integer from 0 to 5, `lives` from 0 to 3, and `rounds` from 3 to 7. Numeric strings are rejected.
- A victory has exactly 5 wins and 1–3 remaining lives.
- A defeat has exactly 0 remaining lives and 0–4 wins.
- `rounds` must equal `wins + (3 - lives)`. Unfinished or inconsistent runs are rejected.
- The server derives `outcome` and the UTC ISO timestamp `createdAt`. Client-supplied values for these fields are ignored, as are other extra fields.

Validation checks plausibility; it does not independently verify that battles were played.

### Success — 201 (new entry) or 200 (identical retry)

```json
{
  "entry": {
    "runId": "abcdefab-1234-4abc-8abc-123456789abc",
    "playerName": "Ada",
    "wins": 5,
    "lives": 2,
    "rounds": 6,
    "outcome": "victory",
    "createdAt": "2026-11-22T08:00:00.000Z"
  }
}
```

Entries are keyed by normalized `runId`. Repeating the same normalized submission returns the original entry and timestamp without adding a duplicate. Changing the name or statistics for an already accepted run returns 409; the original is retained. A client retry must reuse its original run ID.

### Errors

Errors contain only a readable `error` message; internal stack traces are not returned.

| Status | When | Example response |
|---|---|---|
| 400 | Invalid fields or impossible statistics | `{ "error": "Rounds must equal wins plus lost lives (3 minus remaining lives)." }` |
| 400 | Malformed JSON | `{ "error": "Request body must contain valid JSON." }` |
| 409 | Existing run ID with different normalized data | `{ "error": "This run has already been submitted with different data." }` |
| 500 | Unexpected internal failure (also applies to GET) | `{ "error": "An unexpected server error occurred." }` |

### Storage lifetime

The server uses an in-memory Map, with no database or file storage. Restarting the process clears all leaderboard entries and duplicate-prevention records. Idempotency therefore applies within the lifetime of that process.

## Environment variables

| Variable | Effect |
|---|---|
| `PORT` | Port to listen on (default 4200). The Vite proxy expects 4200. |
| `API_LATENCY` | Default delay in milliseconds when a request has no `latency` parameter. |
| `API_FAIL` | `true` makes every opponent request fail with 503. |

Example: `API_FAIL=true pnpm server`.

## Client

`fetchOpponent(round)` in `src/api.ts` performs the request. It resolves with the `Opponent` on success and throws an `Error` carrying the server's `error` text (or a generic message with the status code) for any non-2xx response. When the API is not running, the Vite proxy answers with an error status of its own, which is reported the same way; a network failure rejects as well.

`submitLeaderboardRun(submission)` posts a finished run and resolves with the entry for either HTTP 201 or an identical retry's HTTP 200. `fetchLeaderboard(signal?)` retrieves the sorted entry array and accepts an optional abort signal. Both helpers check successful response structures, report server error messages (with a status-based fallback for non-JSON errors), and propagate network failures. A failed request does not prove that an entry was not saved: retries must reuse the same run ID and normalized data.

The API uses Express's default JSON body-size limit. Oversized requests currently return the generic JSON 500 response; dedicated 413 handling is not implemented.
