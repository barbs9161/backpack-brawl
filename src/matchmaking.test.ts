import { describe, expect, it } from 'vitest';
import { advanceReplay, fightBlocker, leaveBattle, newGame, searchFailed, showFrame, skipReplay, startBattle, startSearch, updateRun } from './game';
import { buyItem, rerollShop, sellItem } from './run';
import type { ActiveSearch, Opponent, Phase } from './types';

const search: ActiveSearch = { searchId: 'search-1', runId: 'run-1', round: 1 };
const opponent: Opponent = { id: 'test', name: 'Test', icon: '', hp: 25, round: 1, items: ['chipped-dagger'] };
const shopping = () => updateRun(newGame(123, search.runId), (run) => buyItem(run, 0));
const searching = () => startSearch(shopping(), search);

describe('B5 matchmaking admission and recovery', () => {
  it('starts only an eligible shop and copies the identity', () => {
    const game = shopping();
    expect(game.activeSearch).toBeNull();
    const next = startSearch({ ...game, error: 'old' }, search);
    expect(next.phase).toBe('searching');
    expect(next.error).toBeNull();
    expect(next.activeSearch).toEqual(search);
    expect(next.activeSearch).not.toBe(search);
    expect(next.run).toBe(game.run);
    const empty = newGame(123, search.runId);
    expect(startSearch(empty, search)).toBe(empty);
  });

  it.each<Phase>(['searching', 'battle', 'finished'])('rejects a search in %s', (phase) => {
    const game = { ...shopping(), phase };
    expect(fightBlocker(game)).not.toBeNull();
    expect(startSearch(game, search)).toBe(game);
  });

  it.each([{ runId: 'other' }, { round: 2 }])('rejects invalid start identity %j', (change) => {
    const game = shopping();
    expect(startSearch(game, { ...search, ...change })).toBe(game);
  });

  it('recovers without changing any run or B7 submission data, and allows retry', () => {
    const game = searching();
    const failed = searchFailed(game, search, 'API unavailable');
    expect(failed.phase).toBe('shop');
    expect(failed.error).toBe('API unavailable');
    expect(failed.activeSearch).toBeNull();
    expect(failed.run).toBe(game.run);
    expect(failed.leaderboardSubmission).toBe(game.leaderboardSubmission);
    expect(failed.runId).toBe(game.runId);
    const retry = startSearch(failed, { ...search, searchId: 'retry' });
    expect(retry.phase).toBe('searching');
    expect(retry.error).toBeNull();
    expect(startBattle(retry, search, opponent)).toBe(retry);
    expect(searchFailed(retry, search, 'late failure')).toBe(retry);
  });

  it.each([{ searchId: 'old' }, { runId: 'old-run' }, { round: 2 }])('ignores stale success and failure %j', (change) => {
    const game = searching();
    const stale = { ...search, ...change };
    expect(startBattle(game, stale, opponent)).toBe(game);
    expect(searchFailed(game, stale, 'stale')).toBe(game);
  });

  it('ignores a response when the game itself has moved to a different run or round', () => {
    for (const game of [{ ...searching(), runId: 'new-run' }, { ...searching(), run: { ...shopping().run, round: 2 } }]) {
      expect(startBattle(game, search, opponent)).toBe(game);
      expect(searchFailed(game, search, 'old')).toBe(game);
    }
  });

  it.each([{ ...opponent, round: 2 }, { ...opponent, items: ['unknown'] }, { ...opponent, hp: 0 }])('recovers for invalid current-search data %j', (invalid) => {
    const game = searching();
    const next = startBattle(game, search, invalid);
    expect(next.phase).toBe('shop');
    expect(next.activeSearch).toBeNull();
    expect(next.error).toContain('Invalid opponent');
    expect(next.run).toBe(game.run);
  });

  it('consumes the request and never replaces the installed replay', () => {
    const game = searching();
    const battle = startBattle(game, search, opponent);
    expect(battle.phase).toBe('battle');
    expect(battle.activeSearch).toBeNull();
    expect(battle.run).toBe(game.run);
    expect(battle.leaderboardSubmission).toBe(game.leaderboardSubmission);
    expect(startBattle(battle, search, opponent)).toBe(battle);
    expect(searchFailed(battle, search, 'late')).toBe(battle);
    const scored = skipReplay(battle);
    expect(startBattle(scored, search, opponent)).toBe(scored);
    const left = leaveBattle(scored);
    expect(startBattle(left, search, opponent)).toBe(left);
  });

  it('rejects battle starts outside searching', () => {
    const game = shopping();
    expect(startBattle(game, search, opponent)).toBe(game);
  });

  it('keeps B1 actions locked during search and usable after failure', () => {
    const game = searching();
    for (const action of [(run: typeof game.run) => buyItem(run, 1), (run: typeof game.run) => sellItem(run, 0), rerollShop]) {
      expect(updateRun(game, action)).toBe(game);
    }
    const recovered = searchFailed(game, search, 'offline');
    expect(updateRun(recovered, (run) => sellItem(run, 0)).run.backpack[0]).toBeNull();
    expect(updateRun(recovered, rerollShop).run.gold).toBe(recovered.run.gold - 1);
    expect(updateRun(recovered, (run) => buyItem(run, 1))).not.toBe(recovered);
  });
});

it.each(['player', 'opponent'] as const)('scores %s once under repeated Skip and completion', (winner) => {
  const battle = startBattle(searching(), search, opponent);
  const controlled = { ...battle, battle: { ...battle.battle!, result: { ...battle.battle!.result, winner } } };
  const advanced = advanceReplay(controlled);
  const scored = skipReplay(advanced);
  expect(scored.run.wins).toBe(controlled.run.wins + Number(winner === 'player'));
  expect(scored.run.lives).toBe(controlled.run.lives - Number(winner === 'opponent'));
  expect(scored.run.round).toBe(2);
  expect(scored.run.gold).toBe(controlled.run.gold + 5);
  expect(skipReplay(scored)).toBe(scored);
  expect(advanceReplay(scored)).toBe(scored);
  expect(showFrame(scored, Infinity)).toBe(scored);
  expect(startBattle(scored, search, opponent)).toBe(scored);
});
