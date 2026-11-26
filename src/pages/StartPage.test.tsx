// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { newGame, skipReplay, startBattle, startSearch, updateRun } from '../game';
import { SAVE_KEY, serializeGame } from '../persistence';
import { buyItem } from '../run';
import { GameProvider } from '../state/GameProvider';
import type { GameState } from '../types';
import { Layout } from './Layout';
import { StartPage } from './StartPage';

const runId = '00000000-0000-4000-8000-000000000001';
const search = { runId, searchId: '00000000-0000-4000-8000-000000000002', round: 1 };
const fresh = () => newGame(123, runId);
const searching = () => startSearch(updateRun(fresh(), (run) => buyItem(run, 0)), search);
const battling = () => startBattle(searching(), search, { id: 'test', name: 'Test', icon: '', hp: 25, round: 1, items: [] });
function finished(): GameState {
  const game = fresh();
  return { ...game, phase: 'finished', run: { ...game.run, round: 5, wins: 5 } };
}
function mount() {
  return render(<StrictMode><GameProvider><MemoryRouter><Routes><Route element={<Layout />}>
    <Route index element={<StartPage />} />
    <Route path="/shop" element={<p>Shop destination</p>} />
    <Route path="/battle" element={<p>Battle destination</p>} />
    <Route path="/result" element={<p>Result destination</p>} />
  </Route></Routes></MemoryRouter></GameProvider></StrictMode>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.removeItem(SAVE_KEY); });

it('shows New run without Continue when no save exists', () => {
  mount();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /New run/ }));
  expect(screen.getByText('Shop destination')).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).game.run.round).toBe(1);
});

it.each([
  ['shop', fresh, 'Shop destination'], ['interrupted search', searching, 'Shop destination'],
  ['active battle', battling, 'Battle destination'], ['completed replay', () => skipReplay(battling()), 'Battle destination'],
  ['finished run', finished, 'Result destination'],
] as const)('continues a saved %s on its matching screen without replacing it', (_label, fixture, destination) => {
  const game = fixture();
  localStorage.setItem(SAVE_KEY, serializeGame(game));
  const original = localStorage.getItem(SAVE_KEY);
  mount();
  expect(screen.getByText(/Starting a new run replaces your saved run/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText(destination)).toBeTruthy();
  expect(localStorage.getItem(SAVE_KEY)).toBe(original);
});

it('clearly labels replacement and creates a fresh saved run', () => {
  localStorage.setItem(SAVE_KEY, serializeGame(finished()));
  mount();
  const button = screen.getByRole('button', { name: /New run/ });
  expect(button.getAttribute('aria-describedby')).toBe('replace-save');
  fireEvent.click(button);
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY)!).game;
  expect(saved.runId).not.toBe(runId);
  expect(saved.run.wins).toBe(0);
  expect(screen.getByText('Shop destination')).toBeTruthy();
});

it('stays on Start after replacement fails and exposes Retry save', () => {
  localStorage.setItem(SAVE_KEY, serializeGame(fresh()));
  const app = mount();
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  fireEvent.click(screen.getByRole('button', { name: /New run/ }));
  expect(screen.getByRole('heading', { name: 'Pack your bag. Win the arena.' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: /New run/ }) as HTMLButtonElement).disabled).toBe(true);
  writes.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(screen.getByRole('status').textContent).toContain('You can continue');
  const replacement = JSON.parse(localStorage.getItem(SAVE_KEY)!).game;
  expect(replacement.runId).not.toBe(runId);
  app.unmount();
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('Shop destination')).toBeTruthy();
});

it('offers a new run for corrupted data without a misleading Continue button', () => {
  localStorage.setItem(SAVE_KEY, '{');
  mount();
  expect(screen.getByRole('alert').textContent).toContain('malformed JSON');
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /New run/ }));
  expect(screen.getByText('Shop destination')).toBeTruthy();
});

it('recovers a denied initial read through a visible storage retry', () => {
  localStorage.setItem(SAVE_KEY, serializeGame(fresh()));
  const reads = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
  mount();
  expect(screen.getByRole('alert').textContent).toContain('could not be read');
  expect((screen.getByRole('button', { name: /New run/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry storage access' }));
  expect(screen.getByRole('status').textContent).toContain('still unavailable');
  reads.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: 'Retry storage access' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
});
