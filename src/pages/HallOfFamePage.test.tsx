// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render as renderUI, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchLeaderboard } from '../api';
import { newGame, routeForGame } from '../game';
import type { LeaderboardEntry, Phase } from '../types';
import { HallOfFamePage } from './HallOfFamePage';
import { GameProvider } from '../state/GameProvider';
import { SAVE_KEY } from '../persistence';

function render(ui: ReactNode) { return renderUI(<GameProvider>{ui}</GameProvider>); }

vi.mock('../api', () => ({ fetchLeaderboard: vi.fn() }));
const entries: LeaderboardEntry[] = [
  { runId: '00000000-0000-4000-8000-000000000002', playerName: 'Zoe', wins: 5, lives: 3, rounds: 5, outcome: 'victory', createdAt: '2026-11-22T08:00:00.000Z' },
  { runId: '00000000-0000-4000-8000-000000000001', playerName: 'Ada', wins: 4, lives: 0, rounds: 7, outcome: 'defeat', createdAt: '2026-11-22T08:00:00.000Z' },
];
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.removeItem(SAVE_KEY); window.history.replaceState({}, '', '/'); });

it('shows loading and passes an active AbortSignal', () => {
  vi.mocked(fetchLeaderboard).mockReturnValue(new Promise(() => {}));
  render(<HallOfFamePage />);
  expect(screen.getByRole('status').textContent).toBe('Loading Hall of Fame…');
  expect(vi.mocked(fetchLeaderboard).mock.calls[0][0]?.aborted).toBe(false);
});

it('shows an empty leaderboard', async () => {
  vi.mocked(fetchLeaderboard).mockResolvedValue([]);
  render(<HallOfFamePage />);
  expect(await screen.findByText(/No finished runs yet/)).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

it('displays every ranking field in server order and explains all tie-breakers', async () => {
  vi.mocked(fetchLeaderboard).mockResolvedValue(entries);
  render(<HallOfFamePage />);
  const table = await screen.findByRole('table', { name: 'Best finished runs' });
  expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Rank', 'Player name', 'Outcome', 'Wins', 'Rounds']);
  const rows = within(table).getAllByRole('row').slice(1);
  expect([...rows[0].children].map((cell) => cell.textContent)).toEqual(['1', 'Zoe', 'Victory', '5', '5']);
  expect([...rows[1].children].map((cell) => cell.textContent)).toEqual(['2', 'Ada', 'Defeat', '4', '7']);
  expect(screen.getByText('Ranking: victories before defeats, then more wins, fewer rounds, and earlier accepted submissions. Equal timestamps are ordered by run ID, ascending.')).toBeTruthy();
});

it('shows API errors and retries with a fresh request and loading state', async () => {
  let resolve!: (entries: LeaderboardEntry[]) => void;
  vi.mocked(fetchLeaderboard).mockRejectedValueOnce(new Error('Arena API unavailable'))
    .mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  render(<HallOfFamePage />);
  expect((await screen.findByRole('alert')).textContent).toBe('Arena API unavailable');
  const oldSignal = vi.mocked(fetchLeaderboard).mock.calls[0][0];
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(fetchLeaderboard).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('status').textContent).toContain('Loading');
  expect(oldSignal?.aborted).toBe(true);
  expect(vi.mocked(fetchLeaderboard).mock.calls[1][0]).not.toBe(oldSignal);
  await act(async () => resolve(entries));
  expect(await screen.findByRole('table')).toBeTruthy();
});

it('provides a fallback for non-Error failures', async () => {
  vi.mocked(fetchLeaderboard).mockRejectedValue('offline');
  render(<HallOfFamePage />);
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load');
});

it.each(['success', 'failure'])('ignores obsolete %s even if the API ignores cancellation', async (result) => {
  let resolve!: (entries: LeaderboardEntry[]) => void;
  let reject!: (error: Error) => void;
  vi.mocked(fetchLeaderboard).mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }))
    .mockResolvedValueOnce(entries);
  renderUI(<StrictMode><GameProvider><HallOfFamePage /></GameProvider></StrictMode>);
  await screen.findByRole('table');
  expect(vi.mocked(fetchLeaderboard).mock.calls[0][0]?.aborted).toBe(true);
  await act(async () => { if (result === 'success') resolve([]); else reject(new Error('Obsolete error')); });
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(/No finished runs/)).toBeNull();
});

it('cancels on unmount and safely ignores a late response', async () => {
  let resolve!: (entries: LeaderboardEntry[]) => void;
  vi.mocked(fetchLeaderboard).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = render(<HallOfFamePage />);
  const signal = vi.mocked(fetchLeaderboard).mock.calls[0][0];
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve(entries));
  expect(screen.queryByRole('table')).toBeNull();
});

it('opens the real Hall of Fame route without a run and preserves start/shop navigation', async () => {
  vi.mocked(fetchLeaderboard).mockResolvedValue([]);
  window.history.replaceState({}, '', '/hall-of-fame');
  const { default: App } = await import('../App');
  render(<App />);
  expect(await screen.findByText(/No finished runs yet/)).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(within(nav).getByRole('link', { name: 'Hall of Fame' }).getAttribute('href')).toBe('/hall-of-fame');
  fireEvent.click(screen.getByRole('link', { name: /Backpack/ }));
  expect(await screen.findByRole('button', { name: /New run/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /New run/ }));
  expect(await screen.findByRole('button', { name: /Buy at least one item first/ })).toBeTruthy();
  expect(window.location.pathname).toBe('/shop');
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
});

it.each<[Phase, string]>([['shop', '/shop'], ['searching', '/shop'], ['battle', '/battle'], ['finished', '/result']])('preserves routeForGame for %s', (phase, path) => {
  expect(routeForGame({ ...newGame(123, entries[0].runId), phase })).toBe(path);
  expect(routeForGame(null)).toBe('/');
});
