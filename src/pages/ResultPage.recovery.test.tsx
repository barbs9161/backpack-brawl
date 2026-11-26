// @vitest-environment jsdom
import { StrictMode, useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { submitLeaderboardRun } from '../api';
import { beginLeaderboardSubmission, newGame, setLeaderboardName } from '../game';
import { SAVE_KEY, serializeGame } from '../persistence';
import { GameProvider } from '../state/GameProvider';
import { useGame, type GameContextValue } from '../state/GameContext';
import { RequireRoute } from '../state/RequireRoute';
import type { GameState, LeaderboardEntry, LeaderboardSubmission } from '../types';
import { Layout } from './Layout';
import { ResultPage } from './ResultPage';

vi.mock('../api', () => ({ submitLeaderboardRun: vi.fn() }));
const runId = '00000000-0000-4000-8000-000000000001';
const payload: LeaderboardSubmission = { runId, playerName: ' Ada ', wins: 5, lives: 2, rounds: 6 };
const entry: LeaderboardEntry = { ...payload, playerName: 'Ada', outcome: 'victory', createdAt: '2026-11-25T12:00:00.000Z' };
function finished(): GameState {
  const game = newGame(123, runId);
  return { ...game, phase: 'finished', run: { ...game.run, wins: 5, lives: 2, round: 6 } };
}
const draft = () => setLeaderboardName(finished(), payload.playerName);
const pending = () => beginLeaderboardSubmission(draft(), runId);
function seed(game: GameState) { localStorage.setItem(SAVE_KEY, serializeGame(game)); }
function mount() {
  let context!: GameContextValue;
  function Probe() {
    const value = useGame();
    useLayoutEffect(() => { context = value; });
    return null;
  }
  const view = render(<StrictMode><GameProvider><MemoryRouter initialEntries={['/result']}>
    <Probe /><Routes><Route element={<Layout />}>
      <Route path="/result" element={<RequireRoute route="/result"><ResultPage /></RequireRoute>} />
      <Route path="/shop" element={<p>New shop</p>} />
    </Route></Routes>
  </MemoryRouter></GameProvider></StrictMode>);
  return { context: () => context, unmount: view.unmount };
}
const input = () => screen.getByRole('textbox', { name: 'Player name' }) as HTMLInputElement;
const retryButton = () => screen.getByRole('button', { name: 'Retry submission' });
function failWrites() { return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); localStorage.removeItem(SAVE_KEY); });

it('restores interrupted submission with a locked original name and no automatic POST', () => {
  seed(pending());
  mount();
  expect(input().value).toBe(payload.playerName);
  expect(input().disabled).toBe(true);
  expect(screen.getByText(/The server may already have accepted this run/)).toBeTruthy();
  expect((retryButton() as HTMLButtonElement).disabled).toBe(false);
  expect(submitLeaderboardRun).not.toHaveBeenCalled();
  fireEvent.change(input(), { target: { value: 'Another name' } });
  expect(input().value).toBe(payload.playerName);
});

it('uses every original payload field despite a previously edited live draft', async () => {
  seed(pending());
  const app = mount();
  act(() => app.context().update((game) => setLeaderboardName(game, 'Edited draft')));
  expect(app.context().game!.leaderboardSubmission.playerName).toBe('Edited draft');
  expect(input().value).toBe(payload.playerName);
  vi.mocked(submitLeaderboardRun).mockResolvedValue(entry);
  fireEvent.click(retryButton());
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(submitLeaderboardRun).toHaveBeenCalledExactlyOnceWith(payload);
  expect(app.context().persistence.interruptedSubmission).toBeNull();
  expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).game.leaderboardSubmission.status).toBe('success');
});

it('keeps successful submission locked after repeated refreshes without more POSTs', async () => {
  seed(pending());
  let app = mount();
  vi.mocked(submitLeaderboardRun).mockResolvedValue(entry);
  fireEvent.click(retryButton());
  await screen.findByText('Your run was saved to the Hall of Fame.');
  for (let index = 0; index < 3; index++) {
    app.unmount();
    app = mount();
    expect(input().disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Run submitted' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole('form'));
  }
  expect(submitLeaderboardRun).toHaveBeenCalledTimes(1);
});

it('retains uncertain intent after network failure and refresh, then retries identically', async () => {
  seed(draft());
  const app = mount();
  vi.mocked(submitLeaderboardRun).mockRejectedValueOnce(new TypeError('Response lost')).mockResolvedValueOnce(entry);
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  await screen.findByText('Response lost');
  expect(input().disabled).toBe(true);
  expect(app.context().persistence.interruptedSubmission).toEqual(payload);
  app.unmount();
  mount();
  expect(submitLeaderboardRun).toHaveBeenCalledTimes(1);
  fireEvent.click(retryButton());
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(vi.mocked(submitLeaderboardRun).mock.calls.map(([sent]) => sent)).toEqual([payload, payload]);
});

it('does not duplicate a server-accepted run when its response was lost', async () => {
  seed(draft());
  const accepted = new Map<string, LeaderboardEntry>();
  vi.mocked(submitLeaderboardRun).mockImplementation(async (sent) => {
    expect(sent).toEqual(payload);
    if (!accepted.has(sent.runId)) {
      accepted.set(sent.runId, entry);
      throw new TypeError('Lost success response');
    }
    return accepted.get(sent.runId)!;
  });
  let app = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  await screen.findByText('Lost success response');
  app.unmount();
  app = mount();
  fireEvent.click(retryButton());
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(accepted.size).toBe(1);
  expect(submitLeaderboardRun).toHaveBeenCalledTimes(2);
  expect(app.context().game!.leaderboardSubmission.entry).toEqual(entry);
});

it('admits one request for rapid explicit retries', async () => {
  seed(pending());
  const request = deferred<LeaderboardEntry>();
  vi.mocked(submitLeaderboardRun).mockReturnValue(request.promise);
  mount();
  const form = screen.getByRole('form');
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(submitLeaderboardRun).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve(entry));
});

it('refreshes an in-flight submission and ignores the old page response', async () => {
  seed(draft());
  const old = deferred<LeaderboardEntry>();
  vi.mocked(submitLeaderboardRun).mockReturnValueOnce(old.promise).mockResolvedValueOnce(entry);
  let app = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  app.unmount();
  app = mount();
  expect(input().disabled).toBe(true);
  await act(async () => old.resolve(entry));
  expect(app.context().game!.leaderboardSubmission.status).toBe('error');
  expect(submitLeaderboardRun).toHaveBeenCalledTimes(1);
  fireEvent.click(retryButton());
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(vi.mocked(submitLeaderboardRun).mock.calls.map(([sent]) => sent)).toEqual([payload, payload]);
});

it('allows correcting the name after a confirmed HTTP 400 rejection, including after refresh', async () => {
  seed(draft());
  vi.mocked(submitLeaderboardRun).mockRejectedValueOnce(Object.assign(new Error('Name rejected'), { status: 400 }));
  const app = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  await screen.findByText('Name rejected');
  expect(input().disabled).toBe(false);
  expect(app.context().persistence.interruptedSubmission).toBeNull();
  app.unmount();
  mount();
  expect(input().disabled).toBe(false);
  fireEvent.change(input(), { target: { value: 'Grace' } });
  vi.mocked(submitLeaderboardRun).mockResolvedValueOnce({ ...entry, playerName: 'Grace' });
  fireEvent.click(retryButton());
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(vi.mocked(submitLeaderboardRun).mock.calls[1][0]).toEqual({ ...payload, playerName: 'Grace' });
});

it.each([409, 500])('preserves original intent after HTTP %s', async (status) => {
  seed(draft());
  vi.mocked(submitLeaderboardRun).mockRejectedValueOnce(Object.assign(new Error('Server error'), { status }));
  const app = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  await screen.findByText('Server error');
  expect(input().disabled).toBe(true);
  expect(app.context().persistence.interruptedSubmission).toEqual(payload);
});

it('blocks POST during a failed intent save and offers explicit save recovery', async () => {
  seed(draft());
  mount();
  const writes = failWrites();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  expect(screen.getByText(/Gameplay is paused/)).toBeTruthy();
  expect(input().disabled).toBe(true);
  fireEvent.submit(screen.getByRole('form'));
  expect(submitLeaderboardRun).not.toHaveBeenCalled();
  writes.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(submitLeaderboardRun).not.toHaveBeenCalled();
  vi.mocked(submitLeaderboardRun).mockResolvedValueOnce(entry);
  fireEvent.click(retryButton());
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(submitLeaderboardRun).toHaveBeenCalledExactlyOnceWith(payload);
});

it('retries saving an accepted result without another submission request', async () => {
  seed(draft());
  const request = deferred<LeaderboardEntry>();
  vi.mocked(submitLeaderboardRun).mockReturnValue(request.promise);
  let app = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  const writes = failWrites();
  await act(async () => request.resolve(entry));
  expect(screen.getByText(/Gameplay is paused/)).toBeTruthy();
  writes.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(screen.getByRole('button', { name: 'Run submitted' })).toBeTruthy();
  app.unmount();
  app = mount();
  expect(app.context().game!.leaderboardSubmission.status).toBe('success');
  expect(submitLeaderboardRun).toHaveBeenCalledTimes(1);
});

it('starting a new run clears uncertain intent without submitting it', () => {
  seed(pending());
  const app = mount();
  expect(screen.getByText(/Starting a new run replaces this saved result/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /New run/ }));
  expect(screen.getByText('New shop')).toBeTruthy();
  expect(app.context().persistence.interruptedSubmission).toBeNull();
  expect(submitLeaderboardRun).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).game.runId).not.toBe(runId);
});
