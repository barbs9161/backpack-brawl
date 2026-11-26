import { buildOpponentFighter, buildPlayerFighter, simulateBattle } from './battle';
import { CATALOG } from './items';
import { isOpponent } from './opponent';
import { GOLD_PER_ROUND, START_GOLD, START_LIVES, WINS_TO_VICTORY, runOutcome } from './run';
import { BACKPACK_SIZE, SHOP_SIZE } from './shop';
import type { GameState, LeaderboardSubmission, RunState } from './types';

export const SAVE_KEY = 'backpack-brawl.saved-game';
export const SAVE_VERSION = 1;
/** Bump when catalog, economy, combat, or opponent rules become incompatible. */
export const RULES_VERSION = 1;
/** Bounds JSON parsing/validation work; current six-item replays fit comfortably. */
export const MAX_SAVE_LENGTH = 262_144;

export interface SavedGameV1 {
  version: typeof SAVE_VERSION;
  rulesVersion: typeof RULES_VERSION;
  game: GameState;
}

export interface RestoredGame {
  game: GameState;
  notices: string[];
  /** Future integration must retry this exact payload, not an edited name. */
  interruptedSubmission: LeaderboardSubmission | null;
}

type RejectedSave = { status: 'invalid' | 'incompatible'; message: string };
export type ValidationResult = { status: 'valid'; save: SavedGameV1 } | RejectedSave;
export type LoadGameResult =
  | ({ status: 'loaded' } & RestoredGame)
  | { status: 'missing' }
  | RejectedSave
  | { status: 'unavailable'; message: string };
export type SaveGameResult = { status: 'saved' } | { status: 'error'; message: string };
export type GameStorage = Pick<Storage, 'getItem' | 'setItem'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const itemId = (value: unknown): value is string =>
  typeof value === 'string' && CATALOG.some((item) => item.id === value);

/** Structural comparison ignores object key order, but requires every canonical field. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => equal(value, b[index]));
  }
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

function validRun(value: unknown): value is RunState {
  if (!record(value)
    || !integer(value.round, 1, WINS_TO_VICTORY + START_LIVES - 1)
    || !integer(value.wins, 0, WINS_TO_VICTORY)
    || !integer(value.lives, 0, START_LIVES)
    || !integer(value.seed, 0, 2 ** 32 - 1)
    || !Array.isArray(value.shop) || value.shop.length !== SHOP_SIZE
    || !Array.from(value.shop).every((id) => id === null || itemId(id))
    || !Array.isArray(value.backpack) || value.backpack.length !== BACKPACK_SIZE) return false;

  const income = START_GOLD + GOLD_PER_ROUND * (value.round - 1);
  if (!integer(value.gold, 0, income) || !integer(value.nextUid, 1, income + 1)) return false;
  const uids = new Set<string>();
  let inventoryCost = 0;
  for (const slot of value.backpack) {
    if (slot === null) continue;
    if (!record(slot) || !itemId(slot.itemId) || typeof slot.uid !== 'string'
      || !/^item-[1-9]\d*$/.test(slot.uid)
      || !integer(Number(slot.uid.slice(5)), 1, value.nextUid - 1) || uids.has(slot.uid)) return false;
    uids.add(slot.uid);
    inventoryCost += CATALOG.find((item) => item.id === slot.itemId)!.price;
  }
  // Buying and selling cannot create money. Every historical purchase consumes
  // at least one net gold under rules v1, even if the item was later sold.
  return value.gold + inventoryCost <= income
    && value.shop.filter((id) => id === null).length <= value.nextUid - 1;
}

function validSubmission(game: GameState): boolean {
  const submission: unknown = game.leaderboardSubmission;
  if (!record(submission) || typeof submission.playerName !== 'string'
    || !nullableText(submission.error)) return false;
  const { status, entry } = submission;
  if (typeof status !== 'string' || !['idle', 'submitting', 'success', 'error'].includes(status)) return false;
  if (game.phase !== 'finished') {
    return status === 'idle' && submission.playerName === '' && submission.error === null && entry === null;
  }
  if (status === 'idle') return submission.error === null && entry === null;
  if (status === 'error') return entry === null;
  if (!submission.playerName.trim() || submission.error !== null) return false;
  if (status === 'submitting') return entry === null;
  if (!record(entry)) return false;
  const name = submission.playerName.trim();
  return Array.from(name).length <= 30 && !/\p{Cc}/u.test(name)
    && entry.runId === game.runId.toLowerCase() && entry.playerName === name
    && entry.wins === game.run.wins && entry.lives === game.run.lives
    && entry.rounds === game.run.round && entry.outcome === runOutcome(game.run)
    && typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt));
}

function validGame(value: unknown): value is GameState {
  if (!record(value) || !uuid(value.runId) || !validRun(value.run) || !nullableText(value.error)
    || typeof value.phase !== 'string' || !['shop', 'searching', 'battle', 'finished'].includes(value.phase)) return false;
  // The remaining nested fields are checked below before returning this guard.
  const game = value as unknown as GameState;
  const terminal = runOutcome(game.run) !== null;
  const scored = game.run.wins + START_LIVES - game.run.lives;
  if (game.run.wins === WINS_TO_VICTORY && game.run.lives === 0) return false;
  if (game.run.round !== scored + (terminal ? 0 : 1) || !validSubmission(game)) return false;

  if (game.phase === 'searching') {
    const search: unknown = game.activeSearch;
    return !terminal && game.battle === null && game.error === null
      && game.run.backpack.some((slot) => slot !== null)
      && record(search) && uuid(search.searchId)
      && search.runId === game.runId && search.round === game.run.round;
  }
  if (game.activeSearch !== null) return false;
  if (game.phase !== 'battle') {
    return game.battle === null && (game.phase === 'finished' ? terminal : !terminal);
  }

  const battle: unknown = game.battle;
  if (!record(battle) || !isOpponent(battle.opponent)
    || !integer(battle.opponent.round, 1, WINS_TO_VICTORY + START_LIVES - 1)
    || !game.run.backpack.some((slot) => slot !== null) || game.error !== null) return false;
  const player = buildPlayerFighter(game.run.backpack);
  const enemy = buildOpponentFighter(battle.opponent);
  const result = simulateBattle(player, enemy);
  if (!equal(battle.player, player) || !equal(battle.enemy, enemy) || !equal(battle.result, result)
    || !integer(battle.frame, 0, result.frames.length - 1)) return false;

  if (battle.frame < result.frames.length - 1) {
    // Active replay: no score, life loss, reward, or next-round roll applied yet.
    return !terminal && battle.opponent.round === game.run.round;
  }
  // Completed replay: scoring already happened, but Continue has not been pressed.
  const previousWins = game.run.wins - Number(result.winner === 'player');
  const previousLives = game.run.lives + Number(result.winner === 'opponent');
  return integer(previousWins, 0, WINS_TO_VICTORY - 1)
    && integer(previousLives, 1, START_LIVES)
    && battle.opponent.round === previousWins + START_LIVES - previousLives + 1
    && game.run.round === battle.opponent.round + (terminal ? 0 : 1)
    && (terminal || (game.run.gold >= GOLD_PER_ROUND && game.run.shop.every((id) => id !== null)));
}

/** Pure boundary: accepts unknown data, never touches browser storage or repairs scores. */
export function validateSavedGame(value: unknown): ValidationResult {
  try {
    const json = JSON.stringify(value);
    if (!json || json.length > MAX_SAVE_LENGTH || !record(value)) {
      return { status: 'invalid', message: 'Saved game is malformed or too large.' };
    }
    if (!Number.isSafeInteger(value.version) || !Number.isSafeInteger(value.rulesVersion)) {
      return { status: 'invalid', message: 'Saved game is missing valid version fields.' };
    }
    if (value.version !== SAVE_VERSION || value.rulesVersion !== RULES_VERSION) {
      return { status: 'incompatible', message: 'Saved game uses unsupported save or game rules.' };
    }
    if (!validGame(value.game)) return { status: 'invalid', message: 'Saved game describes an invalid or impossible run.' };
    return { status: 'valid', save: { version: SAVE_VERSION, rulesVersion: RULES_VERSION, game: value.game } };
  } catch {
    return { status: 'invalid', message: 'Saved game could not be validated.' };
  }
}

/** Pure serialization; rejects invalid states before callers overwrite a good save. */
export function serializeGame(game: GameState): string {
  const validation = validateSavedGame({ version: SAVE_VERSION, rulesVersion: RULES_VERSION, game });
  if (validation.status !== 'valid') throw new Error(validation.message);
  return JSON.stringify(validation.save);
}

/** Pure normalization of a validated save; detached output, no simulation settlement. */
export function normalizeRestoredGame(save: SavedGameV1): RestoredGame {
  const game: GameState = JSON.parse(JSON.stringify(save.game));
  const restored: RestoredGame = { game, notices: [], interruptedSubmission: null };
  if (game.phase === 'searching') {
    // Rules v1 API has one fixed opponent per round. A retry cannot reroll it.
    game.phase = 'shop';
    game.activeSearch = null;
    game.error = 'Your opponent search was interrupted by refresh. Your shop is unchanged. Find opponent to try again.';
    restored.notices.push(game.error);
  }
  if (game.leaderboardSubmission.status === 'submitting') {
    const { runId, run, leaderboardSubmission } = game;
    restored.interruptedSubmission = {
      runId, playerName: leaderboardSubmission.playerName, wins: run.wins, lives: run.lives, rounds: run.round,
    };
    leaderboardSubmission.status = 'error';
    leaderboardSubmission.error = 'Submission was interrupted by refresh. Retry with the same name and run ID.';
    restored.notices.push(leaderboardSubmission.error);
  }
  return restored;
}

/** Pure parsing and recovery policy, independently testable without a browser. */
export function deserializeGame(json: string): LoadGameResult {
  if (json.length > MAX_SAVE_LENGTH) return { status: 'invalid', message: 'Saved game is too large.' };
  try {
    const validation = validateSavedGame(JSON.parse(json));
    if (validation.status !== 'valid') return validation;
    return { status: 'loaded', ...normalizeRestoredGame(validation.save) };
  } catch {
    return { status: 'invalid', message: 'Saved game contains malformed JSON.' };
  }
}

/** Browser boundary. Even accessing localStorage can throw (or be unavailable in SSR). */
export function loadSavedGame(storage?: Pick<GameStorage, 'getItem'>): LoadGameResult {
  try {
    const json = (storage ?? globalThis.localStorage).getItem(SAVE_KEY);
    return json === null ? { status: 'missing' } : deserializeGame(json);
  } catch {
    return { status: 'unavailable', message: 'Browser storage is unavailable; the saved game could not be read.' };
  }
}

/** One synchronous replacement; failures preserve the previous saved value. */
export function saveGame(game: GameState, storage?: Pick<GameStorage, 'setItem'>): SaveGameResult {
  try {
    const json = serializeGame(game);
    (storage ?? globalThis.localStorage).setItem(SAVE_KEY, json);
    return { status: 'saved' };
  } catch {
    return { status: 'error', message: 'The game could not be saved. Keep this page open and retry saving before continuing.' };
  }
}
