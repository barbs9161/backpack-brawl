import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceReplay, beginLeaderboardSubmission, leaderboardSubmissionFailed, leaderboardSubmissionSucceeded,
  leaveBattle, newGame, routeForGame, setLeaderboardName, showFrame, skipReplay, startBattle, startSearch, updateRun,
} from './game';
import { buyItem, moveItem, rerollShop, sellItem } from './run';
import { CATALOG } from './items';
import {
  MAX_SAVE_LENGTH, RULES_VERSION, SAVE_KEY, SAVE_VERSION, deserializeGame, loadSavedGame,
  normalizeRestoredGame, saveGame, serializeGame, validateSavedGame,
} from './persistence';
import type { GameStorage, SavedGameV1 } from './persistence';
import type { GameState, LeaderboardEntry } from './types';

const runId = '00000000-0000-4000-8000-000000000001';
const searchId = '00000000-0000-4000-8000-000000000002';
const fresh = () => newGame(123, runId);
const shopping = () => updateRun(fresh(), (run) => buyItem(run,
  run.shop.findIndex((id) => CATALOG.some((item) => item.id === id && item.effects.damage)),
));
const searchFor = (game: GameState) => ({ searchId, runId: game.runId, round: game.run.round });
const searching = () => startSearch(shopping(), searchFor(shopping()));
function battleFrom(game: GameState, win = true): GameState {
  const search = searchFor(game);
  return startBattle(startSearch(game, search), search, {
    id: 'test', name: 'Test', icon: '', hp: win ? 1 : 1000, round: game.run.round,
    items: win ? [] : ['iron-cleaver'],
  });
}
const battling = () => battleFrom(shopping());
const completed = () => skipReplay(battling());
function finished(win = true): GameState {
  let game = shopping();
  while (game.phase !== 'finished') game = leaveBattle(skipReplay(battleFrom(game, win)));
  return game;
}
const pending = () => beginLeaderboardSubmission(setLeaderboardName(finished(), ' Ada '), runId);
const acceptedEntry = (game: GameState): LeaderboardEntry => ({
  runId, playerName: 'Ada', wins: game.run.wins, lives: game.run.lives, rounds: game.run.round,
  outcome: 'victory', createdAt: '2026-11-25T12:00:00.000Z',
});
const successful = () => leaderboardSubmissionSucceeded(pending(), runId, acceptedEntry(pending()));
const envelope = (game = fresh()): SavedGameV1 => ({ version: SAVE_VERSION, rulesVersion: RULES_VERSION, game });
function restore(game: GameState) {
  const result = deserializeGame(serializeGame(game));
  expect(result.status).toBe('loaded');
  if (result.status !== 'loaded') throw new Error('Expected loaded save');
  return result;
}
function memoryStorage(initial: string | null = null) {
  let stored = initial;
  const storage: GameStorage = {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_key, value) => { stored = value; }),
  };
  return { storage, value: () => stored };
}
function change(save: SavedGameV1, path: string, value: unknown) {
  const parts = path.split('.');
  let target = save as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts.at(-1)!] = value;
}

afterEach(() => vi.unstubAllGlobals());

describe('B6 versioned serialization', () => {
  it('writes a stable key and explicit schema and rules versions', () => {
    expect(SAVE_KEY).toBe('backpack-brawl.saved-game');
    expect(JSON.parse(serializeGame(fresh()))).toEqual(envelope());
  });

  it.each([
    ['initial shop', fresh], ['shopping', shopping], ['active battle', battling],
    ['completed replay', completed], ['victory', finished], ['defeat', () => finished(false)],
    ['successful submission', successful],
  ] as const)('round-trips %s without changing state or route', (_name, fixture) => {
    const game = fixture();
    const loaded = restore(game);
    expect(loaded.game).toEqual(game);
    expect(loaded.game).not.toBe(game);
    expect(routeForGame(loaded.game)).toBe(routeForGame(game));
    expect(loaded.interruptedSubmission).toBeNull();
    expect(loaded.notices).toEqual([]);
  });

  it('preserves buys, sales, moved slots, sold offers, UIDs and paid rerolls', () => {
    let game = shopping();
    game = updateRun(game, (run) => moveItem(run, 0, 5));
    expect(restore(game).game.run.backpack[5]).toEqual(game.run.backpack[5]);
    game = updateRun(game, (run) => sellItem(run, 5));
    game = updateRun(game, rerollShop);
    const loaded = restore(game).game;
    expect(loaded).toEqual(game);
    expect(updateRun(loaded, rerollShop)).toEqual(updateRun(game, rerollShop));
    for (let index = 0; index < 5; index++) expect(restore(loaded).game).toEqual(game);
  });

  it('does not modify input and returns a detached normalized state', () => {
    const save = envelope(searching());
    const before = structuredClone(save);
    const loaded = normalizeRestoredGame(save);
    loaded.game.run.backpack.fill(null);
    expect(save).toEqual(before);
  });

  it('accepts canonical replay objects with reordered JSON keys', () => {
    const game = battling();
    const battle = game.battle!;
    battle.result = { events: battle.result.events, frames: battle.result.frames,
      reason: battle.result.reason, winner: battle.result.winner };
    expect(restore(game).game).toEqual(game);
  });

  it('accepts every reachable win/loss sequence, including seven-round terminal runs', () => {
    let victories = 0;
    let defeats = 0;
    function visit(game: GameState) {
      expect(restore(game).game).toEqual(game);
      if (game.phase === 'finished') {
        if (game.run.wins === 5) victories++;
        else defeats++;
        return;
      }
      for (const win of [true, false]) {
        const active = battleFrom(game, win);
        expect(active.battle!.result.winner).toBe(win ? 'player' : 'opponent');
        expect(restore(active).game).toEqual(active);
        const done = skipReplay(active);
        expect(restore(done).game).toEqual(done);
        visit(leaveBattle(done));
      }
    }
    visit(shopping());
    expect(victories).toBe(21);
    expect(defeats).toBe(35);
  });

  it.each([0, 2 ** 32 - 1])('accepts the unsigned seed boundary %s', (seed) => {
    const game = fresh();
    game.run.seed = seed;
    expect(restore(game).game.run.seed).toBe(seed);
  });
});

describe('B6 refresh normalization', () => {
  it('returns interrupted search to the identical shop and clears its identity', () => {
    const original = searching();
    const loaded = restore(original);
    expect(loaded.game.phase).toBe('shop');
    expect(loaded.game.activeSearch).toBeNull();
    expect(loaded.game.run).toEqual(original.run);
    expect(loaded.game.runId).toBe(runId);
    expect(loaded.game.leaderboardSubmission).toEqual(original.leaderboardSubmission);
    expect(loaded.game.error).toContain('interrupted by refresh');
    expect(loaded.notices).toEqual([loaded.game.error]);
  });

  it('resumes an intermediate frame with the same opponent and eventual result', () => {
    const original = showFrame(battling(), 2);
    const loaded = restore(original).game;
    expect(loaded.battle!.frame).toBe(2);
    expect(loaded.battle!.opponent).toEqual(original.battle!.opponent);
    expect(advanceReplay(loaded)).toEqual(advanceReplay(original));
    expect(skipReplay(loaded)).toEqual(skipReplay(original));
  });

  it.each([true, false])('does not duplicate scoring for a completed replay (win=%s)', (win) => {
    const done = skipReplay(battleFrom(shopping(), win));
    const loaded = restore(done).game;
    expect(skipReplay(loaded)).toBe(loaded);
    expect(advanceReplay(loaded)).toBe(loaded);
    expect(leaveBattle(loaded)).toEqual(leaveBattle(done));
    expect(loaded.run.round).toBe(2);
    expect(loaded.battle!.opponent.round).toBe(1);
  });

  it('cannot avoid a loss through repeated refreshes before the final frame', () => {
    let game = battleFrom(shopping(), false);
    game = showFrame(game, game.battle!.result.frames.length - 2);
    for (let index = 0; index < 5; index++) game = restore(game).game;
    expect(skipReplay(game).run.lives).toBe(2);
    expect(skipReplay(restore(skipReplay(game)).game).run.lives).toBe(2);
  });

  it.each([true, false])('preserves terminal completed replay before Continue (win=%s)', (win) => {
    let game = shopping();
    const count = win ? 5 : 3;
    for (let index = 1; index < count; index++) game = leaveBattle(skipReplay(battleFrom(game, win)));
    game = skipReplay(battleFrom(game, win));
    const loaded = restore(game).game;
    expect(loaded.phase).toBe('battle');
    expect(skipReplay(loaded)).toBe(loaded);
    expect(leaveBattle(loaded).phase).toBe('finished');
    expect(loaded.run.round).toBe(loaded.battle!.opponent.round);
  });

  it('makes interrupted submission retryable and exposes the exact original payload', () => {
    const original = pending();
    const loaded = restore(original);
    expect(loaded.game.leaderboardSubmission.status).toBe('error');
    expect(loaded.game.leaderboardSubmission.playerName).toBe(' Ada ');
    expect(loaded.interruptedSubmission).toEqual({ runId, playerName: ' Ada ',
      wins: original.run.wins, lives: original.run.lives, rounds: original.run.round });
    expect(loaded.notices[0]).toContain('Submission was interrupted');
    expect(original.leaderboardSubmission.status).toBe('submitting');
  });

  it('preserves unsent drafts and failed submissions', () => {
    const draft = setLeaderboardName(finished(), 'Draft');
    expect(restore(draft).game).toEqual(draft);
    const failed = leaderboardSubmissionFailed(pending(), runId, 'Offline');
    expect(restore(failed).game).toEqual(failed);
  });
});

describe('B6 untrusted data validation', () => {
  it.each([null, false, 42, 'save', [], {}, { version: 1 }, { version: '1', rulesVersion: 1 }])(
    'rejects malformed envelope %j', (value) => {
      expect(validateSavedGame(value).status).toBe('invalid');
    },
  );

  it.each([{ version: 0 }, { version: 2 }, { rulesVersion: 0 }, { rulesVersion: 2 }])(
    'rejects unsupported versions %j', (fields) => {
      const save = { ...envelope(), ...fields };
      expect(validateSavedGame(save).status).toBe('incompatible');
      expect(deserializeGame(JSON.stringify(save)).status).toBe('incompatible');
    },
  );

  const invalidCases: [string, () => GameState, string, unknown][] = [
    ['bad UUID', fresh, 'game.runId', 'run-1'],
    ['unknown phase', fresh, 'game.phase', 'paused'],
    ['missing run', fresh, 'game.run', null],
    ['negative gold', fresh, 'game.run.gold', -1],
    ['unearned gold', fresh, 'game.run.gold', 11],
    ['numeric string', fresh, 'game.run.gold', '10'],
    ['fractional round', fresh, 'game.run.round', 1.5],
    ['round zero', fresh, 'game.run.round', 0],
    ['too many rounds', fresh, 'game.run.round', 8],
    ['inconsistent round', fresh, 'game.run.round', 2],
    ['negative wins', fresh, 'game.run.wins', -1],
    ['too many wins', fresh, 'game.run.wins', 6],
    ['negative lives', fresh, 'game.run.lives', -1],
    ['too many lives', fresh, 'game.run.lives', 4],
    ['negative seed', fresh, 'game.run.seed', -1],
    ['oversized seed', fresh, 'game.run.seed', 2 ** 32],
    ['wrong shop size', fresh, 'game.run.shop', []],
    ['unknown offer', fresh, 'game.run.shop.0', 'missing-item'],
    ['wrong backpack size', fresh, 'game.run.backpack', []],
    ['unknown owned item', shopping, 'game.run.backpack.0.itemId', 'missing-item'],
    ['invalid UID', shopping, 'game.run.backpack.0.uid', 'item-01'],
    ['UID collision counter', shopping, 'game.run.nextUid', 1],
    ['unearned purchase count', fresh, 'game.run.nextUid', 12],
    ['purchases without UID allocation', fresh, 'game.run.shop.0', null],
    ['unpaid inventory', shopping, 'game.run.gold', 10],
    ['missing submission', fresh, 'game.leaderboardSubmission', null],
    ['unknown submission status', fresh, 'game.leaderboardSubmission.status', 'queued'],
    ['non-string name', fresh, 'game.leaderboardSubmission.playerName', 7],
    ['invalid error field', fresh, 'game.error', {}],
    ['shop with search', fresh, 'game.activeSearch', { searchId, runId, round: 1 }],
    ['search missing identity', searching, 'game.activeSearch', null],
    ['bad search UUID', searching, 'game.activeSearch.searchId', 'search'],
    ['search wrong run', searching, 'game.activeSearch.runId', searchId],
    ['search wrong round', searching, 'game.activeSearch.round', 2],
    ['search without items', searching, 'game.run.backpack', Array(6).fill(null)],
    ['battle missing replay', battling, 'game.battle', null],
    ['negative frame', battling, 'game.battle.frame', -1],
    ['fractional frame', battling, 'game.battle.frame', 0.5],
    ['frame beyond end', battling, 'game.battle.frame', 1000],
    ['wrong battle round', battling, 'game.battle.opponent.round', 2],
    ['unknown opponent item', battling, 'game.battle.opponent.items', ['unknown']],
    ['wrong fighter HP', battling, 'game.battle.player.maxHp', 41],
    ['wrong enemy HP', battling, 'game.battle.enemy.maxHp', 2],
    ['forged winner', battling, 'game.battle.result.winner', 'opponent'],
    ['forged frame', battling, 'game.battle.result.frames.0.player.hp', 0],
    ['missing frames', battling, 'game.battle.result.frames', []],
    ['forged events', battling, 'game.battle.result.events', []],
    ['unscored completed win', completed, 'game.run.wins', 0],
    ['unadvanced completed round', completed, 'game.run.round', 1],
    ['missing round reward', completed, 'game.run.gold', 0],
    ['already bought next offer', completed, 'game.run.shop.0', null],
    ['unfinished result screen', fresh, 'game.phase', 'finished'],
    ['finished shop', finished, 'game.phase', 'shop'],
    ['victory without lives', finished, 'game.run.lives', 0],
    ['early submission', fresh, 'game.leaderboardSubmission.status', 'submitting'],
    ['missing successful entry', successful, 'game.leaderboardSubmission.entry', null],
    ['entry wrong run', successful, 'game.leaderboardSubmission.entry.runId', searchId],
    ['entry wrong name', successful, 'game.leaderboardSubmission.entry.playerName', 'Other'],
    ['entry wrong score', successful, 'game.leaderboardSubmission.entry.wins', 4],
    ['entry wrong rounds', successful, 'game.leaderboardSubmission.entry.rounds', 6],
    ['entry wrong outcome', successful, 'game.leaderboardSubmission.entry.outcome', 'defeat'],
    ['entry bad date', successful, 'game.leaderboardSubmission.entry.createdAt', 'yesterday'],
  ];
  it.each(invalidCases)('rejects %s', (_name, fixture, path, value) => {
    const save = envelope(fixture());
    change(save, path, value);
    expect(validateSavedGame(save).status).toBe('invalid');
    expect(deserializeGame(JSON.stringify(save)).status).toBe('invalid');
  });

  it('rejects duplicate item UIDs', () => {
    const game = shopping();
    game.run.backpack[1] = { ...game.run.backpack[0]! };
    expect(validateSavedGame(envelope(game)).status).toBe('invalid');
  });

  it('rejects a final frame whose result has not actually been applied', () => {
    const game = battling();
    game.battle!.frame = game.battle!.result.frames.length - 1;
    expect(validateSavedGame(envelope(game)).status).toBe('invalid');
  });

  it('rejects a finished run still carrying a replay', () => {
    const game = finished();
    game.battle = completed().battle;
    expect(validateSavedGame(envelope(game)).status).toBe('invalid');
  });

  it('keeps pure operations independent of localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, get: () => { throw new Error('Pure code accessed storage'); },
    });
    const save = envelope();
    expect(validateSavedGame(save).status).toBe('valid');
    expect(normalizeRestoredGame(save).game).toEqual(save.game);
    expect(deserializeGame(serializeGame(save.game)).status).toBe('loaded');
  });

  it('rejects active frames paired with already-scored progression', () => {
    const game = completed();
    game.battle!.frame = 0;
    expect(validateSavedGame(envelope(game)).status).toBe('invalid');
  });

  it('rejects a completed loss whose score was replaced with a win', () => {
    const game = skipReplay(battleFrom(shopping(), false));
    game.run.wins = 1;
    game.run.lives = 3;
    expect(validateSavedGame(envelope(game)).status).toBe('invalid');
  });

  it.each([NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects nonfinite/unsafe counters %s', (gold) => {
    const game = fresh();
    game.run.gold = gold;
    expect(validateSavedGame(envelope(game)).status).toBe('invalid');
    expect(() => serializeGame(game)).toThrow();
  });

  it('rejects sparse shop arrays', () => {
    const game = fresh();
    delete game.run.shop[0];
    expect(validateSavedGame(envelope(game)).status).toBe('invalid');
  });

  it('rejects circular and oversized data without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(validateSavedGame(circular).status).toBe('invalid');
    expect(deserializeGame(' '.repeat(MAX_SAVE_LENGTH + 1)).status).toBe('invalid');
    expect(validateSavedGame({ ...envelope(), padding: 'x'.repeat(MAX_SAVE_LENGTH) }).status).toBe('invalid');
  });

  it.each(['', '{', 'undefined', '{"version":1,}'])('handles malformed JSON %j', (json) => {
    expect(deserializeGame(json).status).toBe('invalid');
  });
});

describe('B6 safe storage boundary', () => {
  it('reports missing saves without creating a run or writing anything', () => {
    const { storage } = memoryStorage();
    expect(loadSavedGame(storage)).toEqual({ status: 'missing' });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(SAVE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('saves with one synchronous replacement and loads through pure validation', () => {
    const { storage, value } = memoryStorage('old');
    expect(saveGame(shopping(), storage)).toEqual({ status: 'saved' });
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(SAVE_KEY, serializeGame(shopping()));
    expect(value()).toBe(serializeGame(shopping()));
    expect(loadSavedGame(storage)).toEqual(restore(shopping()));
  });

  it.each(['broken', JSON.stringify({ ...envelope(), version: 99 }), JSON.stringify(envelope({ ...fresh(), phase: 'finished' }))])(
    'reports unusable saves without deleting or replacing data: %s', (json) => {
      const { storage, value } = memoryStorage(json);
      expect(['invalid', 'incompatible']).toContain(loadSavedGame(storage).status);
      expect(value()).toBe(json);
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it('contains read exceptions', () => {
    expect(loadSavedGame({ getItem: () => { throw new Error('SecurityError'); } }).status).toBe('unavailable');
  });

  it('contains quota/security write exceptions', () => {
    expect(saveGame(fresh(), { setItem: () => { throw new Error('QuotaExceededError'); } }).status).toBe('error');
  });

  it('does not overwrite a good save with invalid game state', () => {
    const { storage, value } = memoryStorage(serializeGame(fresh()));
    const bad = fresh();
    bad.run.gold = -1;
    expect(saveGame(bad, storage).status).toBe('error');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(value()).toBe(serializeGame(fresh()));
  });

  it('uses browser localStorage by default without touching other keys', () => {
    const { storage } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(saveGame(fresh()).status).toBe('saved');
    expect(loadSavedGame()).toEqual(restore(fresh()));
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('handles missing browser storage (including server-side use)', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSavedGame().status).toBe('unavailable');
    expect(saveGame(fresh()).status).toBe('error');
  });

  it('contains exceptions thrown when accessing the localStorage property', () => {
    vi.stubGlobal('localStorage', undefined);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, get: () => { throw new Error('Storage denied'); },
    });
    expect(loadSavedGame().status).toBe('unavailable');
    expect(saveGame(fresh()).status).toBe('error');
  });

  it('allows retry after a failed write and atomically replaces an older run', () => {
    const old = serializeGame(fresh());
    const { storage, value } = memoryStorage(old);
    vi.mocked(storage.setItem).mockImplementationOnce(() => { throw new Error('Full'); });
    const next = newGame(456, searchId);
    expect(saveGame(next, storage).status).toBe('error');
    expect(value()).toBe(old);
    expect(saveGame(next, storage).status).toBe('saved');
    const loaded = loadSavedGame(storage);
    expect(loaded.status === 'loaded' && loaded.game.runId).toBe(searchId);
  });
});
