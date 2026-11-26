// @vitest-environment jsdom
import { StrictMode, useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOpponent, submitLeaderboardRun } from '../api';
import {
  advanceReplay, beginLeaderboardSubmission, leaveBattle, newGame, setLeaderboardName,
  showFrame, skipReplay, startBattle, startSearch, updateRun,
} from '../game';
import { CATALOG } from '../items';
import { loadSavedGame, SAVE_KEY, serializeGame } from '../persistence';
import { buyItem, moveItem, rerollShop, sellItem } from '../run';
import { ResultPage } from '../pages/ResultPage';
import type { GameState, LeaderboardEntry, Opponent } from '../types';
import { useGame, type GameContextValue } from './GameContext';
import { GameProvider } from './GameProvider';
import { RequireRoute } from './RequireRoute';

vi.mock('../api', () => ({ fetchOpponent: vi.fn(), submitLeaderboardRun: vi.fn() }));
const runId = '00000000-0000-4000-8000-000000000001';
const searchId = '00000000-0000-4000-8000-000000000002';
const opponent: Opponent = { id: 'test', name: 'Test', icon: '', hp: 1, round: 1, items: [] };
const fresh = () => newGame(123, runId);
const shopping = () => updateRun(fresh(), (run) => buyItem(run,
  run.shop.findIndex((id) => CATALOG.some((item) => item.id === id && item.effects.damage)),
));
const searching = () => startSearch(shopping(), { runId, searchId, round: 1 });
const battling = () => startBattle(searching(), { runId, searchId, round: 1 }, opponent);
function finished(): GameState {
  const game = fresh();
  return { ...game, phase: 'finished', run: { ...game.run, wins: 5, lives: 2, round: 6 } };
}
const pendingSubmission = () => beginLeaderboardSubmission(setLeaderboardName(finished(), ' Ada '), runId);
const entry: LeaderboardEntry = { runId, playerName: 'Ada', wins: 5, lives: 2, rounds: 6,
  outcome: 'victory', createdAt: '2026-11-25T12:00:00.000Z' };

function mount(options: { strict?: boolean; resultPage?: boolean; route?: '/shop' | '/battle' | '/result' } = {}) {
  let context!: GameContextValue;
  const firstRenders: (GameState | null)[] = [];
  function Probe() {
    const value = useGame();
    firstRenders.push(value.game);
    useLayoutEffect(() => { context = value; });
    return null;
  }
  const route = options.route ?? '/shop';
  const content = <GameProvider><MemoryRouter initialEntries={[route]}>
    <Probe />
    {options.resultPage ? <ResultPage /> : <Routes>
      <Route path="/" element={<p>Start screen</p>} />
      <Route path="/shop" element={<RequireRoute route="/shop"><p>Shop screen</p></RequireRoute>} />
      <Route path="/battle" element={<RequireRoute route="/battle"><p>Battle screen</p></RequireRoute>} />
      <Route path="/result" element={<RequireRoute route="/result"><p>Result screen</p></RequireRoute>} />
    </Routes>}
  </MemoryRouter></GameProvider>;
  const view = render(options.strict ? <StrictMode>{content}</StrictMode> : content);
  return { context: () => context, firstRenders, unmount: view.unmount };
}
function seed(game: GameState) { localStorage.setItem(SAVE_KEY, serializeGame(game)); }
function savedGame() {
  const loaded = loadSavedGame();
  if (loaded.status !== 'loaded') throw new Error('Expected saved game');
  return loaded.game;
}
function failWrites() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => { localStorage.removeItem(SAVE_KEY); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); localStorage.removeItem(SAVE_KEY); });

describe('B6 provider initialization and browser refresh', () => {
  it('handles a missing save without writing, generating IDs, or starting requests', () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const uuid = vi.spyOn(crypto, 'randomUUID');
    const app = mount({ strict: true });
    expect(app.firstRenders.every((game) => game === null)).toBe(true);
    expect(app.context().persistence.loadStatus).toBe('missing');
    expect(app.context().persistence.blocked).toBe(false);
    expect(writes).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    expect(fetchOpponent).not.toHaveBeenCalled();
    expect(submitLeaderboardRun).not.toHaveBeenCalled();
    expect(screen.getByText('Start screen')).toBeTruthy();
  });

  it.each([
    ['shop', shopping, '/shop', 'Shop screen'],
    ['active replay', () => showFrame(battling(), 2), '/battle', 'Battle screen'],
    ['completed replay', () => skipReplay(battling()), '/battle', 'Battle screen'],
    ['finished run', finished, '/result', 'Result screen'],
  ] as const)('restores %s before route guards render and remounts identically', (_label, fixture, route, text) => {
    const original = fixture();
    seed(original);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    let app = mount({ route, strict: true });
    expect(app.firstRenders.every((game) => JSON.stringify(game) === JSON.stringify(original))).toBe(true);
    expect(screen.getByText(text)).toBeTruthy();
    for (let index = 0; index < 3; index++) {
      expect(app.context().game).toEqual(original);
      app.unmount();
      app = mount({ route, strict: true });
    }
    expect(app.context().game).toEqual(original);
    expect(writes).not.toHaveBeenCalled();
    expect(fetchOpponent).not.toHaveBeenCalled();
  });

  it('initializes the synchronous state mirror from the loaded game', () => {
    seed(shopping());
    const app = mount();
    const before = app.context().game!;
    act(() => {
      expect(app.context().update((game) => updateRun(game, (run) => moveItem(run, 0, 1)))).toBe(true);
      expect(app.context().update((game) => updateRun(game, (run) => moveItem(run, 1, 5)))).toBe(true);
      expect(savedGame().run.backpack[5]).toEqual(before.run.backpack[0]);
    });
    expect(app.context().game!.run.backpack[5]).toEqual(before.run.backpack[0]);
    expect(app.context().game).toEqual(savedGame());
  });

  it.each(['{', JSON.stringify({ version: 999, rulesVersion: 1 }),
    JSON.stringify({ version: 1, rulesVersion: 1, game: { ...fresh(), phase: 'finished' } })])(
    'falls back safely for corrupted, incompatible, or impossible data: %s', (json) => {
      localStorage.setItem(SAVE_KEY, json);
      const app = mount();
      expect(app.context().game).toBeNull();
      expect(app.context().persistence.error).toBeTruthy();
      expect(app.context().persistence.blocked).toBe(false);
      expect(localStorage.getItem(SAVE_KEY)).toBe(json);
      act(() => app.context().startNewRun());
      expect(app.context().game!.phase).toBe('shop');
      expect(savedGame()).toEqual(app.context().game);
    },
  );

  it('recovers interrupted search without HTTP and preserves its shop across refreshes', () => {
    const original = searching();
    seed(original);
    let app = mount({ strict: true });
    expect(app.context().game!.phase).toBe('shop');
    expect(app.context().game!.activeSearch).toBeNull();
    expect(app.context().game!.run).toEqual(original.run);
    expect(app.context().persistence.notices[0]).toContain('interrupted');
    app.unmount();
    app = mount();
    expect(app.context().game!.run).toEqual(original.run);
    expect(fetchOpponent).not.toHaveBeenCalled();
  });

  it('persists every shop action before returning and preserves UID allocation', () => {
    seed(fresh());
    let app = mount();
    const actions = [
      (game: GameState) => updateRun(game, (run) => buyItem(run, 0)),
      (game: GameState) => updateRun(game, (run) => moveItem(run, 0, 5)),
      (game: GameState) => updateRun(game, (run) => sellItem(run, 5)),
      (game: GameState) => updateRun(game, rerollShop),
      (game: GameState) => updateRun(game, (run) => buyItem(run, 0)),
    ];
    for (const transition of actions) {
      const expected = transition(app.context().game!);
      act(() => {
        expect(app.context().update(transition)).toBe(true);
        expect(savedGame()).toEqual(expected);
      });
      app.unmount();
      app = mount();
      expect(app.context().game).toEqual(expected);
    }
    expect(app.context().game!.run.nextUid).toBe(3);
    expect(app.context().game!.run.backpack[0]!.uid).toBe('item-2');
  });

  it('does not write no-op or disallowed actions', () => {
    seed(battling());
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const app = mount();
    act(() => {
      expect(app.context().update((game) => game)).toBe(false);
      expect(app.context().update((game) => updateRun(game, rerollShop))).toBe(false);
    });
    expect(writes).not.toHaveBeenCalled();
  });

  it('replaces a previous run atomically and refreshes into the replacement', () => {
    seed(skipReplay(battling()));
    let app = mount();
    const oldId = app.context().game!.runId;
    act(() => app.context().startNewRun());
    const replacement = app.context().game!;
    expect(replacement.runId).not.toBe(oldId);
    expect(replacement.run.round).toBe(1);
    expect(replacement.run.backpack.every((slot) => slot === null)).toBe(true);
    expect(replacement.battle).toBeNull();
    expect(savedGame()).toEqual(replacement);
    app.unmount();
    app = mount();
    expect(app.context().game).toEqual(replacement);
  });
});

describe('B6 replay settlement and submission metadata', () => {
  it('applies a winning result and round reward once across repeated refreshes', () => {
    seed(showFrame(battling(), 2));
    let app = mount({ route: '/battle' });
    act(() => app.context().update(skipReplay));
    const done = app.context().game!;
    expect(done.run.wins).toBe(1);
    expect(done.run.round).toBe(2);
    for (let index = 0; index < 3; index++) {
      app.unmount();
      app = mount({ route: '/battle' });
      act(() => {
        expect(app.context().update(skipReplay)).toBe(false);
        expect(app.context().update(advanceReplay)).toBe(false);
      });
      expect(app.context().game).toEqual(done);
    }
    act(() => app.context().update(leaveBattle));
    expect(app.context().game!.run).toEqual(done.run);
    expect(app.context().game!.phase).toBe('shop');
    expect(savedGame()).toEqual(app.context().game);
  });

  it('cannot refresh away a losing replay or apply its life loss twice', () => {
    const game = startBattle(searching(), { runId, searchId, round: 1 }, {
      ...opponent, hp: 1000, items: ['iron-cleaver'],
    });
    seed(game);
    let app = mount({ route: '/battle' });
    app.unmount();
    app = mount({ route: '/battle' });
    act(() => app.context().update(skipReplay));
    expect(app.context().game!.run.lives).toBe(2);
    const scored = app.context().game!.run;
    app.unmount();
    app = mount({ route: '/battle' });
    act(() => app.context().update(skipReplay));
    expect(app.context().game!.run).toEqual(scored);
  });

  it('retains interrupted submission intent through writes and multiple refreshes', () => {
    seed(pendingSubmission());
    let app = mount({ route: '/result', strict: true });
    const intent = app.context().persistence.interruptedSubmission;
    expect(intent!.playerName).toBe(' Ada ');
    expect(app.context().game!.leaderboardSubmission.status).toBe('error');
    act(() => app.context().update((game) => setLeaderboardName(game, 'Edited draft')));
    expect(app.context().persistence.interruptedSubmission).toEqual(intent);
    app.unmount();
    app = mount({ route: '/result' });
    expect(app.context().persistence.interruptedSubmission).toEqual(intent);
    expect(app.context().game!.runId).toBe(runId);
    expect(submitLeaderboardRun).not.toHaveBeenCalled();
    act(() => app.context().startNewRun());
    expect(app.context().persistence.interruptedSubmission).toBeNull();
    expect(app.context().persistence.notices).toEqual([]);
    expect(savedGame().leaderboardSubmission.status).toBe('idle');
  });
});

describe('B6 write failures and synchronous admission', () => {
  it('retains one failed candidate, blocks same-batch actions and retries it exactly once', async () => {
    seed(shopping());
    const app = mount();
    const original = app.context().game!;
    const expected = updateRun(original, rerollShop);
    const writes = failWrites();
    const secondTransition = vi.fn((game: GameState) => updateRun(game, rerollShop));
    const uuid = vi.spyOn(crypto, 'randomUUID');
    act(() => {
      expect(app.context().update((game) => updateRun(game, rerollShop))).toBe(false);
      expect(app.context().update(secondTransition)).toBe(false);
      app.context().startNewRun();
      void app.context().findOpponent();
    });
    expect(app.context().game).toBe(original);
    expect(app.context().persistence.blocked).toBe(true);
    expect(app.context().persistence.error).toBeTruthy();
    expect(secondTransition).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    expect(fetchOpponent).not.toHaveBeenCalled();
    expect(savedGame()).toEqual(original);
    act(() => { expect(app.context().retrySave()).toBe(false); });
    writes.mockRestore();
    act(() => { expect(app.context().retrySave()).toBe(true); });
    expect(app.context().game).toEqual(expected);
    expect(savedGame()).toEqual(expected);
    expect(app.context().persistence.blocked).toBe(false);
    act(() => app.context().retrySave());
    expect(app.context().game).toEqual(expected);
    await act(async () => {});
  });

  it('does not expose a failed new run and retries the same ID and seed', () => {
    seed(shopping());
    const app = mount();
    const original = app.context().game!;
    const uuid = vi.spyOn(crypto, 'randomUUID');
    const random = vi.spyOn(Math, 'random');
    const writes = failWrites();
    act(() => app.context().startNewRun());
    expect(app.context().game).toBe(original);
    expect(savedGame()).toEqual(original);
    const generatedId = uuid.mock.results[0].value;
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(random).toHaveBeenCalledTimes(1);
    writes.mockRestore();
    act(() => app.context().retrySave());
    expect(app.context().game!.runId).toBe(generatedId);
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(random).toHaveBeenCalledTimes(1);
    expect(savedGame()).toEqual(app.context().game);
  });

  it('does not issue an opponent request until search intent is saved', async () => {
    seed(shopping());
    const app = mount();
    const writes = failWrites();
    await act(async () => app.context().findOpponent());
    expect(fetchOpponent).not.toHaveBeenCalled();
    expect(app.context().persistence.blocked).toBe(true);
    writes.mockRestore();
    act(() => app.context().retrySave());
    expect(app.context().game!.phase).toBe('shop');
    expect(app.context().game!.activeSearch).toBeNull();
    expect(fetchOpponent).not.toHaveBeenCalled();
    vi.mocked(fetchOpponent).mockImplementation(async () => {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!);
      expect(raw.game.phase).toBe('searching');
      return opponent;
    });
    await act(async () => app.context().findOpponent());
    expect(app.context().game!.phase).toBe('battle');
    expect(savedGame()).toEqual(app.context().game);
  });

  it('retains an accepted opponent if saving battle admission fails', async () => {
    seed(shopping());
    const request = deferred<Opponent>();
    vi.mocked(fetchOpponent).mockReturnValue(request.promise);
    const app = mount();
    act(() => { void app.context().findOpponent(); });
    const signal = vi.mocked(fetchOpponent).mock.calls[0][1]!;
    const writes = failWrites();
    await act(async () => request.resolve(opponent));
    expect(app.context().game!.phase).toBe('searching');
    expect(app.context().persistence.blocked).toBe(true);
    expect(signal.aborted).toBe(true);
    writes.mockRestore();
    act(() => app.context().retrySave());
    expect(app.context().game!.phase).toBe('battle');
    expect(app.context().game!.battle!.opponent).toEqual(opponent);
    expect(fetchOpponent).toHaveBeenCalledTimes(1);
  });

  it('retries a failed final-frame save without applying the result again', () => {
    seed(battling());
    const app = mount({ route: '/battle' });
    const before = app.context().game!;
    const writes = failWrites();
    act(() => app.context().update(skipReplay));
    expect(app.context().game).toBe(before);
    expect(savedGame()).toEqual(before);
    writes.mockRestore();
    act(() => app.context().retrySave());
    expect(app.context().game).toEqual(skipReplay(before));
    act(() => app.context().update(skipReplay));
    expect(app.context().game!.run.wins).toBe(1);
  });

  it('blocks Hall of Fame POST when saving submission intent fails', () => {
    seed(setLeaderboardName(finished(), 'Ada'));
    const app = mount({ resultPage: true, route: '/result' });
    const writes = failWrites();
    fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
    expect(app.context().persistence.blocked).toBe(true);
    expect(submitLeaderboardRun).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('form'));
    expect(submitLeaderboardRun).not.toHaveBeenCalled();
    writes.mockRestore();
    act(() => app.context().retrySave());
    expect(app.context().game!.leaderboardSubmission.status).toBe('error');
    expect(app.context().persistence.interruptedSubmission!.playerName).toBe('Ada');
    expect(submitLeaderboardRun).not.toHaveBeenCalled();
  });

  it('saves submission intent before POST and retains a failed success-save for retry', async () => {
    seed(setLeaderboardName(finished(), 'Ada'));
    const request = deferred<LeaderboardEntry>();
    vi.mocked(submitLeaderboardRun).mockImplementation(() => {
      expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).game.leaderboardSubmission.status).toBe('submitting');
      return request.promise;
    });
    const app = mount({ resultPage: true, route: '/result' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
    const writes = failWrites();
    await act(async () => request.resolve(entry));
    expect(app.context().persistence.blocked).toBe(true);
    expect(app.context().game!.leaderboardSubmission.status).toBe('submitting');
    writes.mockRestore();
    act(() => app.context().retrySave());
    expect(app.context().game!.leaderboardSubmission.status).toBe('success');
    expect(app.context().persistence.interruptedSubmission).toBeNull();
    fireEvent.submit(screen.getByRole('form'));
    expect(submitLeaderboardRun).toHaveBeenCalledTimes(1);
  });

  it('blocks overwriting unread storage until the initial read can be retried', () => {
    seed(shopping());
    const reads = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const app = mount();
    expect(app.context().persistence.blocked).toBe(true);
    expect(app.context().game).toBeNull();
    act(() => app.context().startNewRun());
    expect(writes).not.toHaveBeenCalled();
    act(() => { expect(app.context().retrySave()).toBe(false); });
    reads.mockRestore();
    act(() => { expect(app.context().retrySave()).toBe(true); });
    expect(app.context().game).toEqual(shopping());
    expect(app.context().persistence.blocked).toBe(false);
  });

  it('ignores retained callbacks after unmount and aborts the old request', async () => {
    seed(shopping());
    const request = deferred<Opponent>();
    vi.mocked(fetchOpponent).mockReturnValue(request.promise);
    const app = mount();
    act(() => { void app.context().findOpponent(); });
    const retained = app.context();
    const signal = vi.mocked(fetchOpponent).mock.calls[0][1]!;
    const before = localStorage.getItem(SAVE_KEY);
    app.unmount();
    expect(signal.aborted).toBe(true);
    retained.startNewRun();
    expect(retained.update(skipReplay)).toBe(false);
    expect(retained.retrySave()).toBe(false);
    await retained.findOpponent();
    await act(async () => request.resolve(opponent));
    expect(localStorage.getItem(SAVE_KEY)).toBe(before);
    const refreshed = mount();
    expect(refreshed.context().game!.phase).toBe('shop');
    expect(fetchOpponent).toHaveBeenCalledTimes(1);
  });
});
