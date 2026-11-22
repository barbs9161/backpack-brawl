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

## B7 — Hall of Fame

After a victory or defeat, enter a player name on the result screen and submit the finished run. The Hall of Fame is available at `/hall-of-fame`, including without an active run. Loading, empty, success, and error feedback explain what is happening; failed submissions retain the name for retry.

**Architecture.** `server/leaderboard.js` owns pure validation and ranking plus an isolated in-memory store. `server/app.js::createApp()` receives that store and exposes GET/POST `/api/leaderboard`; `server/index.js` creates one store and starts Express. `src/api.ts` handles HTTP and checks response structures. `GameProvider` creates a UUID when starting a run; `src/game.ts` preserves it and applies pure submission transitions. `ResultPage` coordinates submission, `LeaderboardForm` renders controlled inputs, and `HallOfFamePage` renders the server's sorted entries without sorting again.

**Ranking.** Victories rank before defeats, followed by more wins, fewer rounds, earlier server acceptance timestamps, and ascending normalized run UUIDs when timestamps are equal. These rules are also displayed on the leaderboard.

**Validation.** The server requires a valid UUID, a trimmed name of 1–30 Unicode code points without control characters, and integer statistics. A victory has exactly 5 wins and 1–3 lives; a defeat has 0–4 wins and no lives. Finished runs must satisfy `rounds === wins + (3 - lives)`, with 3–7 rounds. The server derives outcome and timestamp. This checks plausibility rather than proving that a run was played; names render as React text.

**Idempotency and lifetime.** The Map is keyed by normalized run UUID. A new entry returns HTTP 201; an identical normalized retry returns HTTP 200 with the original entry and timestamp; different data for that UUID returns HTTP 409. Pending/successful submissions are blocked in the UI, and late responses cannot update another run. After an uncertain network failure, retry with the same name and run ID: the server may already have accepted it. Restarting Express clears both entries and duplicate records. Browser refresh also loses the current run and submission state; B6 save/resume is not implemented.

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
