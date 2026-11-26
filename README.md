# Backpack Brawl

Backpack Brawl is a small browser-based inventory auto-battler. You are a travelling hero entering the arena with nothing but an empty backpack and a few coins. Between fights you buy items in a shop and pack them into your backpack. The fights themselves run on their own: every item in the backpack fires whenever its cooldown is up, and you watch the battle play out.

This is a partially completed starter for the Advanced Web Development practical exam. It is playable, but it is not yet a finished game. Investigate its existing behavior and extend it according to the requirements.

## How the game works

### The run

A run is a series of rounds. Every round you shop, then fight one opponent.

| Rule | Value |
|---|---:|
| Lives at the start | 3 |
| Wins needed for victory | 5 |
| Starting gold | 10 🪙 |
| Gold at the start of every new round | +5 🪙 |
| Hero base HP | 40 |

A won battle gives +1 win, a lost battle costs one life. The run ends with a victory screen after the fifth win, or a game-over screen when the last life is gone. Unspent gold and the whole backpack carry over from round to round. Opponents get tougher every round.

### Shop and backpack

- The shop shows **4 offers**, rolled from the catalog at the start of every round. The same offer may appear more than once.
- **Buy** pays the price and puts the item into the first free slot of the backpack. A bought offer is marked as sold until the next round.
- The backpack is a **2×3 grid** (2 columns, 3 rows, 6 slots), and every item takes exactly one slot. A bought item stays in its slot for the whole run. Hover over an item to see its details.
- Only items in the backpack fight. Their position in the grid does not matter.

Shop rolls are driven by a seeded random number generator stored in the run state, so the same seed always produces the same offers.

### Battles

Press **Find opponent** to request this round's opponent from the local API. The request is deliberately slow, so there is a short "searching" phase. While searching, the shop and the backpack are locked.

Once the opponent arrives, the whole battle is simulated at once and then replayed on screen, one step every 250 ms. **Skip** jumps straight to the end. The result is applied to the run when the replay reaches its last step; the button below the result then leads to the next round's shop or to the end screen.

Battle time runs in **ticks of 0.5 s**:

- Every item has a **cooldown** in ticks. Each tick, every item charges by one. When the charge reaches the cooldown, the item fires and starts charging again.
- **Damage** hits the enemy. **Block** absorbs incoming damage first. Only the rest is lost from HP. Unused block stays for the rest of the battle.
- A fighter at 0 HP is knocked out. If both fall in the same tick, the hero loses.
- A battle lasts at most **60 ticks (30 s)**. If time runs out, the fighter with the higher share of their max HP wins. A tie counts as a loss for the hero.

The battle screen shows HP and block for both fighters, their items, a timer, and a combat log. Hover over values to see an explanation of each rule.

### Item catalog

| Item | Price | Cooldown (ticks) | Effect |
|---|---:|---:|---|
| 🗡️ Chipped Dagger | 2 | 4 | 3 damage |
| 🏹 Hunting Bow | 4 | 4 | 5 damage |
| 🪓 Iron Cleaver | 5 | 8 | 12 damage |
| 🛡️ Oak Buckler | 3 | 5 | +4 block |
| 🍳 Pot Lid | 2 | 3 | +2 block |
| ⚔️ Spiked Shield | 4 | 6 | 3 damage, +3 block |

Items have no sets and no other effects. The "How it works" panel in the shop summarises these rules in the game itself.

## Current starter features

- A start page, a shop page, a battle page and a result page, each with its own URL.
- A run with rounds, gold, lives and wins, ending in victory or defeat.
- A seeded shop with buying.
- A fixed 2×3 backpack grid with item tooltips.
- A deterministic battle simulation with damage and block.
- A replayed battle view with HP and block bars, a timer, a combat log and a skip button.
- A delayed local opponent API with success and failure responses.
- Tooltips and a rules panel explaining every mechanic.
- A responsive React interface styled with Tailwind CSS.

Vitest tests cover B1 economy, leaderboard rules, Express HTTP integration, frontend API communication, submission transitions, and React components. Tests live beside the code as `*.test.js`, `*.test.ts`, or `*.test.tsx`; component tests use React Testing Library and jsdom.

## B5 — Resilient matchmaking

Find opponent shows a searching message and locks the fight button and shop actions. One provider-owned request is allowed at a time, including rapid clicks and navigation away from the shop. Every attempt captures a unique search ID, the existing run ID, and the round. Pure transitions admit only the matching active request; accepting a battle consumes that search, so late or duplicate responses cannot reset its replay. Existing replay completion guards apply a result once.

Opponent responses are checked for valid fields, catalog item IDs, and the requested round. HTTP errors, network failures, malformed responses, and an eight-second request timeout return to the same usable shop with readable feedback. Retry is explicit, keeps the same run ID, and creates a new search ID. Failure preserves gold, backpack, round, lives, wins, RNG seed, offers, and leaderboard submission state; it does not grant a free shop roll. Starting a new run or unmounting the provider cancels obsolete work; navigating between pages does not cancel a valid search.

The qualitative goals are single-request reliability, recovery within the request timeout, and understandable retry feedback. Provider ownership adds a small amount of coordination but survives route changes; request identities protect correctness even when cancellation arrives late. No state library, backend contract change, or automatic retry is needed. Controllers and timers remain transient; B6 persists meaningful game state and normalizes interrupted searches without issuing another request. Evaluate with deferred-response race tests, fake-timer timeout/replay tests, API response checks, B1/B7 regressions, and browser checks for double clicks, offline/retry, navigation, and new-run cancellation.

## B6 — Save and resume

The run saves automatically in this browser. The start page offers **Continue**, which uses the run's phase to return to the shop, battle replay, or result screen. **New run** replaces the saved run, including an unsubmitted result or interrupted submission; it does not delete Hall of Fame entries on the server.

### Saved properties and format

`src/persistence.ts` separates pure serialization, runtime validation, and refresh normalization from guarded storage access. The localStorage key is **`backpack-brawl.saved-game`**. Its JSON envelope has **`version: 1`** and **`rulesVersion: 1`**, plus the game snapshot. Schema changes require a save-version decision; incompatible catalog, economy, combat, or opponent changes require a rules-version decision. Unsupported versions are rejected; there is no implicit migration.

The snapshot preserves the run UUID and phase; round, gold, lives, wins, RNG seed, current shop offers and sold markers; backpack slots, item IDs, item UIDs and the next UID counter; search identity; battle opponent, fighters, deterministic result, replay frames/events and current frame; and Hall of Fame name, status and accepted entry. Controllers, promises, timers, selected-item highlights and the Hall of Fame list are transient.

`GameProvider` loads and validates synchronously during initialization, before route guards render, and initializes React state and its synchronous mirror consistently. Changed states pass through a synchronous save before they are published. Buying, selling, rerolling, moving/swapping backpack items, replay progression, result settlement, submissions and new-run replacement use this same path. No-op actions do not rewrite storage.

### Refresh and recovery policies

- **Shop:** restore the exact offers, sold markers, resources, backpack and next-roll seed. Refresh does not roll another shop.
- **Opponent search:** return to the unchanged shop with an interruption notice. Retry is explicit and creates a fresh search identity. The current API has one fixed opponent per round, so retry cannot select another opponent. Random matchmaking would require a different reservation/idempotency contract.
- **Battle replay:** resume the same opponent and frame. The deterministic result is validated against a recomputed simulation. An active replay is unscored; a completed replay already contains its win/loss and any next-round reward and shop. Refresh never settles it again. Continue leaves a completed replay normally.
- **Finished run:** restore the result screen, draft name and submission state. A successful submission stays locked and never automatically POSTs again.
- **Interrupted or uncertain submission:** preserve the exact original run ID, name and statistics; lock the name and require explicit retry. The durable snapshot keeps pending intent until success or a confirmed HTTP 400 validation rejection. Identical retries use the existing server deduplication contract. A confirmed validation rejection unlocks the name for correction. A network error, invalid success response, server error or conflict does not justify changing uncertain intent.
- **Missing save:** show the normal start page. **Malformed, incompatible or impossible save:** announce the problem and allow a new run. Rejected data is not partially repaired, deleted or overwritten during loading. A successfully saved new run replaces it.
- **Storage read failure:** block starting or changing a run to avoid overwriting unread data. **Retry storage access** attempts the read again.
- **Storage write failure:** retain the exact candidate in memory, keep the last saved state visible, abort obsolete opponent work, and block further gameplay and mutation requests. The shared notice remains available outside disabled page controls. **Retry save** saves the retained candidate without rerunning its transition. Failed search/submission admission recovers to a retryable state and does not automatically issue HTTP requests. Keep the page open while recovering: a pending candidate cannot survive closing or refreshing when storage refuses writes.

Validation checks safe integer/range constraints, UUIDs, catalog IDs, shop/backpack sizes, unique item UIDs, allocation counters, plausible resource limits, phase/search consistency, terminal scores, canonical battle data and accepted-entry consistency. JSON input is bounded to 262,144 characters. These checks detect invalid or implausible data; browser storage is not authoritative proof that a run was played.

### Compatibility, limitations and evaluation

B1 actions retain their atomic economy and phase guards. B2 backpack positions and UIDs survive refresh. B5 retains provider-owned requests, aborts, current run/round/search checks, explicit retries, and duplicate-response guards. B7 retains stable run IDs, original retry payloads, late-response guards and server-side deduplication. No backend API contract or dependency was added.

localStorage is synchronous and specific to the browser profile and origin, including port. Quotas, browser settings, private browsing, eviction or clearing site data can remove saves or prevent access. Saves do not transfer between devices, browsers or origins. Use **one game tab**: there is no multi-tab locking, storage-event synchronization or conflict resolution; simultaneous tabs may overwrite each other. Hall of Fame entries and server duplicate records remain in memory and disappear when Express restarts. A locally saved success remains locked even if the server has since restarted.

The qualitative goals are refresh continuity, exactly-once result application, understandable accessible recovery, and keeping game rules independent of storage. The trade-off is synchronous validation/storage work for each meaningful transition, including replay frames; compact replay formats and multi-tab coordination are outside this implementation. Evaluate with pure validation tests, provider unmount/remount tests against shared storage, Strict Mode checks, deferred-response races, UI recovery tests, and the complete B1/B5/B7 regression suite. The application exposes these policies in **Save and refresh policy** above every page.

### Manual browser checks

1. Run `npm run dev` and open `http://localhost:5174`. Start a run, buy/sell items, move an item and pay for a reroll. Refresh and verify the exact offers, sold markers, backpack positions and gold. Open the start page and use Continue.
2. Refresh while searching. Verify the interrupted-search notice, unchanged shop and explicit Find opponent retry. Refresh during battle, then after the last frame but before Continue. Verify the same opponent and replay progress, and a single win/loss and round reward.
3. In DevTools Application/Storage, replace `backpack-brawl.saved-game` with malformed JSON or change its version. Reload: verify an accessible error, no Continue button and a working New run replacement.
4. Temporarily make `Storage.prototype.setItem` throw in DevTools, keeping a reference to the original function. Trigger a reroll: verify disabled game controls and an enabled Retry save. Restore the function and retry; only one reroll should be charged. Similarly make `getItem` throw before reload to check Retry storage access, then restore it and recover.
5. Finish a run, enter a name and submit. Use network throttling to refresh while submission is pending. Verify no automatic POST, a locked original name and explicit identical retry. After success, refresh again: the form stays locked and the Network panel shows no additional POST. The Hall of Fame should contain one entry.
6. Return to Start and choose New run. Verify the replacement warning and a fresh run after refresh. Check that keyboard navigation reaches policy details and recovery buttons, and that feedback uses status/alert announcements.

## B7 — Hall of Fame

After a victory or defeat, enter a player name on the result screen and submit the finished run. The Hall of Fame is available at `/hall-of-fame`, including without an active run. Loading, empty, success, and error feedback explain what is happening; failed submissions retain the name for retry.

**Architecture.** `server/leaderboard.js` owns pure validation and ranking plus an isolated in-memory store. `server/app.js::createApp()` receives that store and exposes GET/POST `/api/leaderboard`; `server/index.js` creates one store and starts Express. `src/api.ts` handles HTTP and checks response structures. `GameProvider` creates a UUID when starting a run; `src/game.ts` preserves it and applies pure submission transitions. `ResultPage` coordinates submission, `LeaderboardForm` renders controlled inputs, and `HallOfFamePage` renders the server's sorted entries without sorting again.

**Ranking.** Victories rank before defeats, followed by more wins, fewer rounds, earlier server acceptance timestamps, and ascending normalized run UUIDs when timestamps are equal. These rules are also displayed on the leaderboard.

**Validation.** The server requires a valid UUID, a trimmed name of 1–30 Unicode code points without control characters, and integer statistics. A victory has exactly 5 wins and 1–3 lives; a defeat has 0–4 wins and no lives. Finished runs must satisfy `rounds === wins + (3 - lives)`, with 3–7 rounds. The server derives outcome and timestamp. This checks plausibility rather than proving that a run was played; names render as React text.

**Idempotency and lifetime.** The Map is keyed by normalized run UUID. A new entry returns HTTP 201; an identical normalized retry returns HTTP 200 with the original entry and timestamp; different data for that UUID returns HTTP 409. Pending/successful submissions are blocked in the UI, and late responses cannot update another run. B6 persists the run and submission intent across browser refresh. Uncertain submissions retry explicitly with their exact original payload; accepted submissions remain locked. Restarting Express clears both entries and duplicate records.

### Qualitative goals and trade-offs

| Goal | Decision and trade-off | Evaluation |
|---|---|---|
| Reliable retries and consistent results | Stable run IDs, synchronous server deduplication, and guarded transitions prevent duplicate entries and stale updates. Idempotency lasts only for the server process. | Duplicate/conflict HTTP tests, rapid-submit tests, stale-response tests, and manual request replay. |
| Understandable, accessible feedback | Labelled controlled input, status/alert messages, disabled pending controls, and retry without retyping. Native `maxLength` counts UTF-16 units, so emoji-heavy names can reach the UI limit before the server's code-point limit. | Component tests for labels and states; browser keyboard and error/retry checks. |
| Simple, testable architecture | Separate rules, HTTP handling, and presentation; inject a fresh store for each API test. Memory storage avoids database setup but has no durability, authentication, or capacity management. | Pure rule tests, isolated HTTP tests using ephemeral ports, component tests, lint, and production build. |

See [docs/API.md](docs/API.md) for request examples and the full endpoint contract. Run `npm test -- --run`, `npm run lint`, and `npm run build` before review. The current ESLint rules primarily cover TypeScript/TSX; backend behavior is covered by JavaScript unit and HTTP tests.

## Run locally

Requirements: use Node.js 22.22+ within the Node 22 release line to satisfy the installed dependencies' engine requirements, and pnpm (npm works as well; replace `pnpm` with `npm run` / `npm install`). Node 20 can produce engine warnings even when individual checks pass.

```bash
pnpm install
pnpm dev
```

The web app runs at `http://localhost:5174`; its API runs at `http://localhost:4200`. During development Vite forwards every `/api` request to the API, so the frontend only ever calls relative `/api/...` URLs.

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the Vite frontend and the Express API together |
| `pnpm server` | Start only the API on port 4200 |
| `pnpm build` | Type-check and create a production frontend build |
| `pnpm lint` | Run ESLint over the project |
| `pnpm test` | Run all Vitest tests once |
| `pnpm preview` | Preview a previously created production build |

## API

- `GET /api/health`
- `GET /api/opponents?round=1`
- `GET /api/leaderboard`
- `POST /api/leaderboard`

The opponent for each round is fixed. Add `?latency=2500` to change the delay (default 1200 ms, at most 5000 ms) or `?fail=true` to force a failed request. Starting the server with `API_FAIL=true` makes every opponent request fail.

See [docs/API.md](docs/API.md) for the full contract.

## Project orientation

Game rules live in plain TypeScript modules that do not depend on React. Every rule function takes the current state and returns a new one.

- `src/types.ts` defines items, the run, opponents, phases, battle frames and events, and the overall game state.
- `src/items.ts` contains the item catalog and the effect labels.
- `src/shop.ts` contains the seeded random number generator, shop rolls and the backpack size.
- `src/run.ts` contains the run rules: starting values, buying, round progression and win/loss.
- `src/battle.ts` turns item lists into fighters and contains the battle simulation (`simulateBattle`).
- `src/game.ts` contains the phase transitions of a run (`shop → searching → battle → shop … → finished`), the replay steps and the mapping from phase to page.
- `src/rules.ts` builds the rule explanations and tooltips from the game constants.
- `src/api.ts` contains opponent and leaderboard HTTP requests.
- `src/state/` holds the game state for all pages (`GameProvider`, `useGame`) and `RequireRoute`, which redirects every page to the one matching the current phase.
- `src/pages/` contains one component per screen; `src/App.tsx` defines the routes.
- `src/components/` contains the presentational parts: run header, shop, backpack, item card, rules panel, fight bar, battle view and end-of-run screen.
- `server/index.js` starts the local API; `server/app.js` creates the Express app, `server/opponents.js` contains the opponent table, and `server/leaderboard.js` contains leaderboard validation, ranking, and storage.
