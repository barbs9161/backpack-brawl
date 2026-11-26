// @vitest-environment jsdom
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { submitLeaderboardRun } from '../api';
import { newGame } from '../game';
import { GameContext } from '../state/GameContext';
import type { GameState, LeaderboardEntry } from '../types';
import { ResultPage } from './ResultPage';

vi.mock('../api', () => ({ submitLeaderboardRun: vi.fn() }));
const runId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const entry: LeaderboardEntry = { runId, playerName: 'Ada', wins: 5, lives: 2, rounds: 6, outcome: 'victory', createdAt: '2026-11-22T08:00:00.000Z' };
const finished = (): GameState => {
  const game = newGame(123, runId);
  return { ...game, phase: 'finished', run: { ...game.run, wins: 5, lives: 2, round: 6 } };
};

function mount(initial = finished()) {
  let current = initial;
  const restart = vi.fn();
  function Harness() {
    const [game, setGame] = useState(initial);
    current = game;
    return <GameContext value={{ game, findOpponent: async () => {},
      persistence: { loadStatus: 'missing', notices: [], error: null, blocked: false, interruptedSubmission: null },
      retrySave: () => true,
      update: (transition) => {
        const next = transition(current);
        const changed = next !== current;
        current = next;
        setGame(next);
        return changed;
      }, startNewRun: () => {
      restart();
      setGame(newGame(123, otherId));
      return true;
    } }}><ResultPage /></GameContext>;
  }
  render(<MemoryRouter><Harness /></MemoryRouter>);
  return { current: () => current, restart };
}

function enterName() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Player name' }), { target: { value: 'Ada' } });
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('sends the stable ID and terminal statistics, retains RunOver, and prevents resubmission', async () => {
  vi.mocked(submitLeaderboardRun).mockResolvedValue(entry);
  const harness = mount();
  expect(screen.getByRole('heading', { name: 'Champion of the arena!' })).toBeTruthy();
  expect(screen.getByText('5 wins in 6 rounds, 2 lives left.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View Hall of Fame' }).getAttribute('href')).toBe('/hall-of-fame');
  expect(submitLeaderboardRun).not.toHaveBeenCalled();
  enterName();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(submitLeaderboardRun).toHaveBeenCalledExactlyOnceWith({ runId, playerName: 'Ada', wins: 5, lives: 2, rounds: 6 });
  fireEvent.submit(screen.getByRole('form'));
  expect(submitLeaderboardRun).toHaveBeenCalledTimes(1);
  expect(harness.current().leaderboardSubmission.status).toBe('success');
  fireEvent.click(screen.getByRole('button', { name: /New run/ }));
  expect(harness.restart).toHaveBeenCalledTimes(1);
  expect(harness.current().runId).toBe(otherId);
});

it('preserves a failed name and retries with the same run ID', async () => {
  vi.mocked(submitLeaderboardRun).mockRejectedValueOnce(new Error('The server is unavailable')).mockResolvedValueOnce(entry);
  mount();
  enterName();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The server is unavailable');
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Ada');
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }));
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(vi.mocked(submitLeaderboardRun).mock.calls.map(([payload]) => payload)).toEqual([
    { runId, playerName: 'Ada', wins: 5, lives: 2, rounds: 6 },
    { runId, playerName: 'Ada', wins: 5, lives: 2, rounds: 6 },
  ]);
});

it('uses a synchronous guard for two submissions in the same batch', async () => {
  let resolve!: (entry: LeaderboardEntry) => void;
  vi.mocked(submitLeaderboardRun).mockImplementation(() => new Promise((done) => { resolve = done; }));
  mount();
  enterName();
  const form = screen.getByRole('form');
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(submitLeaderboardRun).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toContain('Submitting');
  await act(async () => { resolve(entry); });
});

it.each(['success', 'failure'])('ignores stale %s after starting a new run', async (result) => {
  let resolve!: (entry: LeaderboardEntry) => void;
  let reject!: (error: Error) => void;
  vi.mocked(submitLeaderboardRun).mockImplementation(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
  const harness = mount();
  enterName();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  fireEvent.click(screen.getByRole('button', { name: /New run/ }));
  const newer = harness.current();
  await act(async () => { if (result === 'success') resolve(entry); else reject(new Error('Old error')); });
  expect(harness.current()).toBe(newer);
  expect(harness.current().leaderboardSubmission.status).toBe('idle');
});

it('keeps the defeat summary and submits defeat statistics', async () => {
  const game = finished();
  game.run = { ...game.run, wins: 2, lives: 0, round: 5 };
  vi.mocked(submitLeaderboardRun).mockResolvedValue({ ...entry, wins: 2, lives: 0, rounds: 5, outcome: 'defeat' });
  mount(game);
  expect(screen.getByRole('heading', { name: 'Your run is over' })).toBeTruthy();
  enterName();
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  await screen.findByText('Your run was saved to the Hall of Fame.');
  expect(submitLeaderboardRun).toHaveBeenCalledWith({ runId, playerName: 'Ada', wins: 2, lives: 0, rounds: 5 });
});

it('does not display the form before the finished phase', () => {
  mount({ ...finished(), phase: 'battle' });
  expect(screen.queryByRole('form')).toBeNull();
  expect(submitLeaderboardRun).not.toHaveBeenCalled();
});
