// @vitest-environment jsdom
import { useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchLeaderboard, fetchOpponent } from '../api';
import { newGame, startBattle, startSearch, updateRun } from '../game';
import { SAVE_KEY, serializeGame } from '../persistence';
import { buyItem } from '../run';
import { useGame, type GameContextValue } from '../state/GameContext';
import { GameProvider } from '../state/GameProvider';
import { BattlePage } from './BattlePage';
import { HallOfFamePage } from './HallOfFamePage';
import { Layout } from './Layout';
import { ShopPage } from './ShopPage';

vi.mock('../api', () => ({ fetchLeaderboard: vi.fn(), fetchOpponent: vi.fn() }));
const runId = '00000000-0000-4000-8000-000000000001';
const shopping = () => updateRun(newGame(123, runId), (run) => buyItem(run, 0));
function mount(route = '/shop') {
  let context!: GameContextValue;
  function Probe() {
    const value = useGame();
    useLayoutEffect(() => { context = value; });
    return null;
  }
  const view = render(<GameProvider><MemoryRouter initialEntries={[route]}><Probe /><Routes>
    <Route element={<Layout />}>
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/battle" element={<BattlePage />} />
      <Route path="/hall-of-fame" element={<HallOfFamePage />} />
    </Route>
  </Routes></MemoryRouter></GameProvider>);
  return { context: () => context, unmount: view.unmount };
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); localStorage.removeItem(SAVE_KEY); });

it('leaves storage recovery enabled outside disabled game controls and resumes the saved action', () => {
  const original = shopping();
  localStorage.setItem(SAVE_KEY, serializeGame(original));
  const app = mount();
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  fireEvent.click(screen.getByRole('button', { name: /Reroll/ }));
  expect((screen.getByRole('group', { name: 'Game controls' }) as HTMLFieldSetElement).disabled).toBe(true);
  const retry = screen.getByRole('button', { name: 'Retry save' });
  expect(retry.closest('fieldset')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Find opponent/ }));
  expect(fetchOpponent).not.toHaveBeenCalled();
  expect(app.context().game!.run).toEqual(original.run);
  writes.mockRestore();
  fireEvent.click(retry);
  expect(app.context().game!.run.gold).toBe(original.run.gold - 1);
  expect(app.context().persistence.blocked).toBe(false);
  expect((screen.getByRole('group', { name: 'Game controls' }) as HTMLFieldSetElement).disabled).toBe(false);
});

it('holds a replay at its saved frame during failure and resumes after visible retry', () => {
  vi.useFakeTimers();
  const search = { runId, searchId: '00000000-0000-4000-8000-000000000002', round: 1 };
  const battle = startBattle(startSearch(shopping(), search), search, {
    id: 'test', name: 'Test', icon: '', hp: 1000, round: 1, items: ['iron-cleaver'],
  });
  localStorage.setItem(SAVE_KEY, serializeGame(battle));
  const app = mount('/battle');
  act(() => vi.advanceTimersByTime(250));
  expect(app.context().game!.battle!.frame).toBe(1);
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  act(() => vi.advanceTimersByTime(250));
  expect(app.context().persistence.blocked).toBe(true);
  act(() => vi.advanceTimersByTime(2000));
  expect(app.context().game!.battle!.frame).toBe(1);
  expect(app.context().game!.run.lives).toBe(3);
  writes.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(app.context().game!.battle!.frame).toBe(2);
  act(() => vi.advanceTimersByTime(250));
  expect(app.context().game!.battle!.frame).toBe(3);
  expect(app.context().game!.battle!.opponent).toEqual(battle.battle!.opponent);
});

it('does not retain a successful recovery announcement when storage fails again', () => {
  localStorage.setItem(SAVE_KEY, serializeGame(shopping()));
  mount();
  let writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  fireEvent.click(screen.getByRole('button', { name: /Reroll/ }));
  writes.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(screen.getByText('Browser storage is ready. You can continue.')).toBeTruthy();
  writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full again'); });
  fireEvent.click(screen.getByRole('button', { name: /Reroll/ }));
  expect(screen.queryByText('Browser storage is ready. You can continue.')).toBeNull();
  expect(screen.getByText(/Browser storage is still unavailable/)).toBeTruthy();
  writes.mockRestore();
});

it('does not fetch Hall of Fame while storage access is blocked, then loads after recovery', async () => {
  const reads = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
  vi.mocked(fetchLeaderboard).mockResolvedValue([]);
  mount('/hall-of-fame');
  expect(fetchLeaderboard).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Retry storage access' })).toBeTruthy();
  reads.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry storage access' }));
  await screen.findByText('No finished runs yet. Complete a run to join the Hall of Fame.');
  expect(fetchLeaderboard).toHaveBeenCalledTimes(1);
});

it('keeps pending-save protection in force after navigating to Hall of Fame', async () => {
  localStorage.setItem(SAVE_KEY, serializeGame(shopping()));
  vi.mocked(fetchLeaderboard).mockResolvedValue([]);
  mount();
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  fireEvent.click(screen.getByRole('button', { name: /Reroll/ }));
  fireEvent.click(screen.getByRole('link', { name: 'Hall of Fame' }));
  expect(fetchLeaderboard).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Retry save' })).toBeTruthy();
  writes.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  await screen.findByText('No finished runs yet. Complete a run to join the Hall of Fame.');
  expect(fetchLeaderboard).toHaveBeenCalledTimes(1);
});
