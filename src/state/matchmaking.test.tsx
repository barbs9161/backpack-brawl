// @vitest-environment jsdom
import { StrictMode, useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchOpponent } from '../api';
import { updateRun } from '../game';
import { buyItem, sellItem } from '../run';
import { ShopPage } from '../pages/ShopPage';
import type { Opponent } from '../types';
import { useGame, type GameContextValue } from './GameContext';
import { GameProvider } from './GameProvider';

vi.mock('../api', () => ({ fetchOpponent: vi.fn() }));
const opponent: Opponent = { id: 'test', name: 'Test', icon: '', hp: 25, round: 1, items: ['chipped-dagger'] };

function deferred() {
  let resolve!: (value: Opponent) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Opponent>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function mount() {
  let context!: GameContextValue;
  function Probe() {
    const value = useGame();
    useLayoutEffect(() => { context = value; });
    return <><Link to="/away">Away</Link><Link to="/shop">Shop</Link></>;
  }
  const view = render(<StrictMode><GameProvider><MemoryRouter initialEntries={['/shop']}>
    <Probe />
    <Routes><Route path="/shop" element={<ShopWhenActive />} /><Route path="/away" element={<p>Another page</p>} /></Routes>
  </MemoryRouter></GameProvider></StrictMode>);
  act(() => context.startNewRun());
  act(() => context.update((game) => updateRun(game, (run) => buyItem(run, 0))));
  return { context: () => context, unmount: view.unmount };
}

function ShopWhenActive() {
  const { game } = useGame();
  return game ? <ShopPage /> : null;
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('searches once under rapid calls and StrictMode, shows loading, and installs one battle', async () => {
  const request = deferred();
  vi.mocked(fetchOpponent).mockReturnValue(request.promise);
  const app = mount();
  const before = app.context().game!;
  act(() => { void app.context().findOpponent(); void app.context().findOpponent(); });
  expect(fetchOpponent).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Searching the arena/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Searching…' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button', { name: /Reroll/ }).closest('fieldset')?.disabled).toBe(true);
  await act(async () => request.resolve(opponent));
  expect(app.context().game!.phase).toBe('battle');
  expect(app.context().game!.activeSearch).toBeNull();
  expect(app.context().game!.run).toBe(before.run);
  expect(app.context().game!.runId).toBe(before.runId);
  expect(app.context().game!.leaderboardSubmission).toBe(before.leaderboardSubmission);
  await act(async () => app.context().findOpponent());
  expect(fetchOpponent).toHaveBeenCalledTimes(1);
});

it('restores the exact run after API failure and retries with the same run and a new search ID', async () => {
  const first = deferred();
  const retry = deferred();
  vi.mocked(fetchOpponent).mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
  const app = mount();
  const before = app.context().game!;
  fireEvent.click(screen.getByRole('button', { name: /Find opponent/ }));
  const oldSearch = app.context().game!.activeSearch!;
  await act(async () => first.reject(new Error('API unavailable')));
  const failed = app.context().game!;
  expect(failed.phase).toBe('shop');
  expect(failed.run).toBe(before.run);
  expect(failed.error).toBe('API unavailable');
  expect(screen.getByRole('alert').textContent).toContain('API unavailable');
  expect(screen.getByRole('button', { name: /Reroll/ }).closest('fieldset')?.disabled).toBe(false);
  expect((screen.getByRole('button', { name: /Find opponent/ }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: /Find opponent/ }));
  const newSearch = app.context().game!.activeSearch!;
  expect(newSearch.searchId).not.toBe(oldSearch.searchId);
  expect(newSearch.runId).toBe(oldSearch.runId);
  expect(newSearch.round).toBe(oldSearch.round);
  await act(async () => retry.resolve(opponent));
  expect(app.context().game!.phase).toBe('battle');
});

it.each(['success', 'failure'])('cancels old work and ignores late %s while a new run is searching', async (result) => {
  const old = deferred();
  const next = deferred();
  vi.mocked(fetchOpponent).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const app = mount();
  act(() => { void app.context().findOpponent(); });
  const oldSignal = vi.mocked(fetchOpponent).mock.calls[0][1]!;
  const oldId = app.context().game!.runId;
  act(() => app.context().startNewRun());
  expect(oldSignal.aborted).toBe(true);
  expect(app.context().game!.runId).not.toBe(oldId);
  act(() => app.context().update((game) => updateRun(game, (run) => buyItem(run, 0))));
  act(() => { void app.context().findOpponent(); });
  const newer = app.context().game!;
  await act(async () => { if (result === 'success') old.resolve(opponent); else old.reject(new Error('old failure')); });
  expect(app.context().game).toBe(newer);
  act(() => { void app.context().findOpponent(); });
  expect(fetchOpponent).toHaveBeenCalledTimes(2);
  await act(async () => next.resolve(opponent));
  expect(app.context().game!.phase).toBe('battle');
});

it('keeps a valid search alive across ShopPage unmount and remount', async () => {
  const request = deferred();
  vi.mocked(fetchOpponent).mockReturnValue(request.promise);
  const app = mount();
  fireEvent.click(screen.getByRole('button', { name: /Find opponent/ }));
  const signal = vi.mocked(fetchOpponent).mock.calls[0][1]!;
  fireEvent.click(screen.getByRole('link', { name: 'Away' }));
  expect(screen.getByText('Another page')).toBeTruthy();
  expect(signal.aborted).toBe(false);
  fireEvent.click(screen.getByRole('link', { name: 'Shop' }));
  expect(screen.getByText(/Searching the arena/)).toBeTruthy();
  act(() => { void app.context().findOpponent(); });
  expect(fetchOpponent).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve(opponent));
  expect(app.context().game!.phase).toBe('battle');
});

it('aborts pending work when the provider unmounts', async () => {
  const request = deferred();
  vi.mocked(fetchOpponent).mockReturnValue(request.promise);
  const app = mount();
  act(() => { void app.context().findOpponent(); });
  const signal = vi.mocked(fetchOpponent).mock.calls[0][1]!;
  app.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => request.resolve(opponent));
});

it('recovers when an invalid current-search response reaches the provider', async () => {
  vi.mocked(fetchOpponent).mockResolvedValue({ ...opponent, round: 2 });
  const app = mount();
  const run = app.context().game!.run;
  await act(async () => app.context().findOpponent());
  expect(app.context().game!.phase).toBe('shop');
  expect(app.context().game!.run).toBe(run);
  expect(app.context().game!.error).toContain('Invalid opponent');
});

it('rejects a same-batch new-run/old-render search without HTTP or a pending lock', async () => {
  const request = deferred();
  vi.mocked(fetchOpponent).mockReturnValue(request.promise);
  const app = mount();
  const previous = app.context();
  act(() => { previous.startNewRun(); void previous.findOpponent(); });
  expect(fetchOpponent).not.toHaveBeenCalled();
  expect(app.context().game!.phase).toBe('shop');
  expect(app.context().game!.activeSearch).toBeNull();
  act(() => app.context().update((game) => updateRun(game, (run) => buyItem(run, 0))));
  act(() => { void app.context().findOpponent(); });
  expect(fetchOpponent).toHaveBeenCalledTimes(1);
  expect(app.context().game!.activeSearch?.runId).toBe(app.context().game!.runId);
  await act(async () => request.resolve(opponent));
  expect(app.context().game!.phase).toBe('battle');
});

it('rejects a retained callback from a replaced run even when the new run is eligible', async () => {
  const request = deferred();
  vi.mocked(fetchOpponent).mockReturnValue(request.promise);
  const app = mount();
  const oldFindOpponent = app.context().findOpponent;
  act(() => app.context().startNewRun());
  act(() => app.context().update((game) => updateRun(game, (run) => buyItem(run, 0))));
  const newer = app.context().game;
  await act(async () => oldFindOpponent());
  expect(fetchOpponent).not.toHaveBeenCalled();
  expect(app.context().game).toBe(newer);
  act(() => { void app.context().findOpponent(); void app.context().findOpponent(); });
  expect(fetchOpponent).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve(opponent));
});

it('uses queued eligibility changes and leaves no lock after rejected admission', async () => {
  const request = deferred();
  vi.mocked(fetchOpponent).mockReturnValue(request.promise);
  const app = mount();
  const previous = app.context();
  act(() => {
    previous.update((game) => updateRun(game, (run) => sellItem(run, 0)));
    void previous.findOpponent();
  });
  expect(fetchOpponent).not.toHaveBeenCalled();
  expect(app.context().game!.activeSearch).toBeNull();
  act(() => {
    app.context().update((game) => updateRun(game, (run) => buyItem(run, 1)));
    void app.context().findOpponent();
    void app.context().findOpponent();
  });
  expect(fetchOpponent).toHaveBeenCalledTimes(1);
  expect(app.context().game!.phase).toBe('searching');
  await act(async () => request.resolve(opponent));
});

it('composes batched updates without losing state or rolling back the admission mirror', async () => {
  const request = deferred();
  vi.mocked(fetchOpponent).mockReturnValue(request.promise);
  const app = mount();
  const before = app.context().game!;
  act(() => {
    app.context().update((game) => ({ ...game, run: { ...game.run, gold: game.run.gold + 1 } }));
    app.context().update((game) => ({ ...game, run: { ...game.run, gold: game.run.gold + 2 } }));
  });
  expect(app.context().game!.run.gold).toBe(before.run.gold + 3);
  act(() => { void app.context().findOpponent(); });
  expect(fetchOpponent).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve(opponent));
  expect(app.context().game!.run.gold).toBe(before.run.gold + 3);
});
