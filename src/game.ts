import { buildOpponentFighter, buildPlayerFighter, simulateBattle } from './battle';
import { applyBattleResult, newRun, runOutcome } from './run';
import { itemIdsOf } from './shop';
import type { BattleReplay, GameState, LeaderboardEntry, Opponent, RunState } from './types';

/**
 * Phase transitions of one run: shop → searching → battle → shop … → finished.
 * Every function is pure, so they can be passed straight to `setState`.
 */

export function newGame(seed: number, runId: string): GameState {
  return {
    runId,
    leaderboardSubmission: { playerName: '', status: 'idle', error: null, entry: null },
    phase: 'shop', run: newRun(seed), battle: null, error: null,
  };
}

export function setLeaderboardName(game: GameState, playerName: string): GameState {
  const submission = game.leaderboardSubmission;
  if (game.phase !== 'finished' || submission.status === 'submitting' || submission.status === 'success') return game;
  return { ...game, leaderboardSubmission: { ...submission, playerName } };
}

export function beginLeaderboardSubmission(game: GameState, runId: string): GameState {
  const submission = game.leaderboardSubmission;
  if (game.runId !== runId || game.phase !== 'finished' || !runOutcome(game.run)
    || submission.status === 'submitting' || submission.status === 'success') return game;
  return { ...game, leaderboardSubmission: { ...submission, status: 'submitting', error: null } };
}

export function leaderboardSubmissionSucceeded(game: GameState, runId: string, entry: LeaderboardEntry): GameState {
  if (game.runId !== runId || entry.runId !== runId || game.phase !== 'finished'
    || game.leaderboardSubmission.status !== 'submitting') return game;
  return { ...game, leaderboardSubmission: { ...game.leaderboardSubmission, status: 'success', error: null, entry: { ...entry } } };
}

export function leaderboardSubmissionFailed(game: GameState, runId: string, error: string): GameState {
  if (game.runId !== runId || game.phase !== 'finished' || game.leaderboardSubmission.status !== 'submitting') return game;
  return { ...game, leaderboardSubmission: { ...game.leaderboardSubmission, status: 'error', error } };
}

/** Applies a shop/backpack action; only allowed while shopping. */
// This function also protects against selling during the battle phase, which would be a bug. It is called from the ShopPage component when the player clicks buy or sell.
// sellItem() and buyItem() are receive only RunState and return a new RunState, so they are pure functions. updateRun() takes the current GameState and applies the action to the RunState, returning a new GameState with the updated RunState. This is why the phase check belongs in updateRun() and not in sellItem() or buyItem(). The UI triggers the action, but the game logic calculates the new state.
export function updateRun(game: GameState, action: (run: RunState) => RunState): GameState {
  if (game.phase !== 'shop') return game; // If the game is not in the "shop" phase, return the unchanged game state.
  const run = action(game.run);
  return run === game.run ? game : { ...game, run };
}

/** Why the player can't look for an opponent right now, or `null` if they can. */
export function fightBlocker(game: GameState): string | null {
  if (itemIdsOf(game.run.backpack).length === 0) return 'Buy at least one item first';
  return null;
}

export function startSearch(game: GameState): GameState {
  if (fightBlocker(game) !== null) return game;
  return { ...game, phase: 'searching', error: null };
}

export function searchFailed(game: GameState, error: string): GameState {
  return { ...game, error };
}

/** Simulates the battle against `opponent` and starts its replay at the first frame. */
export function startBattle(game: GameState, opponent: Opponent): GameState {
  const player = buildPlayerFighter(game.run.backpack);
  const enemy = buildOpponentFighter(opponent);
  const result = simulateBattle(player, enemy);
  return { ...game, phase: 'battle', battle: { opponent, player, enemy, result, frame: 0 } };
}

export const isReplayDone = (battle: BattleReplay) =>
  battle.frame >= battle.result.frames.length - 1;

/** Shows the given frame; reaching the last frame applies the battle result to the run (exactly once). */
export function showFrame(game: GameState, frame: number): GameState {
  const { battle } = game;
  if (game.phase !== 'battle' || !battle || isReplayDone(battle)) return game;
  const last = battle.result.frames.length - 1;
  const next = { ...battle, frame: Math.min(Math.max(frame, battle.frame), last) };
  if (!isReplayDone(next)) return { ...game, battle: next };
  return { ...game, battle: next, run: applyBattleResult(game.run, battle.result.winner) };
}

export const advanceReplay = (game: GameState) => showFrame(game, (game.battle?.frame ?? 0) + 1);
export const skipReplay = (game: GameState) => showFrame(game, Infinity);

/** Leaves a finished replay: back to the shop, or to the end screen if the run is over. */
export function leaveBattle(game: GameState): GameState {
  if (game.phase !== 'battle' || !game.battle || !isReplayDone(game.battle)) return game;
  return { ...game, phase: runOutcome(game.run) ? 'finished' : 'shop', battle: null };
}

/** URL paths of the app's screens. */
export const ROUTES = { start: '/', shop: '/shop', battle: '/battle', result: '/result', hallOfFame: '/hall-of-fame' } as const;
export type GameRoute = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * The screen that matches the game's phase. Shop, battle and result pages
 * redirect here when they don't match, so the URL always follows the phase.
 */
export function routeForGame(game: GameState | null): GameRoute {
  if (!game) return ROUTES.start;
  switch (game.phase) {
    case 'shop':
    case 'searching':
      return ROUTES.shop;
    case 'battle':
      return ROUTES.battle;
    case 'finished':
      return ROUTES.result;
  }
}
