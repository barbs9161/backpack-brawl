// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { GameContext, type PersistenceState } from '../state/GameContext';
import { PersistenceNotice } from './PersistenceNotice';

const ready: PersistenceState = { loadStatus: 'missing', notices: [], error: null, blocked: false, interruptedSubmission: null };
function mount(fields: Partial<PersistenceState> = {}, retrySave = vi.fn(() => true)) {
  function Harness() {
    const [persistence, setPersistence] = useState({ ...ready, ...fields });
    return <GameContext value={{ game: null, persistence, retrySave: () => {
      const recovered = retrySave();
      setPersistence((current) => ({ ...current, blocked: !recovered, error: recovered ? null : current.error }));
      return recovered;
    }, startNewRun: () => false, findOpponent: async () => {}, update: () => false }}><PersistenceNotice /></GameContext>;
  }
  render(<Harness />);
  return retrySave;
}
afterEach(cleanup);

it('provides a named region and refresh policies without alarming normal saves', () => {
  mount();
  const region = screen.getByRole('region', { name: 'Save and resume' });
  expect(within(region).getByText('Save and refresh policy')).toBeTruthy();
  fireEvent.click(screen.getByText('Save and refresh policy'));
  expect(screen.getByText(/Refreshing during an opponent search returns to the unchanged shop/)).toBeTruthy();
  expect(screen.getByText(/Refreshing during battle resumes the same opponent and replay frame/)).toBeTruthy();
  expect(screen.getByText(/Successful submissions stay locked/)).toBeTruthy();
  expect(screen.getByText(/Use one game tab/)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it.each(['invalid', 'incompatible'] as const)('announces %s save recovery without a nonfunctional retry', (loadStatus) => {
  mount({ loadStatus, error: `Saved game is ${loadStatus}.` });
  expect(screen.getByRole('alert').textContent).toContain(loadStatus);
  expect(screen.getByRole('alert').textContent).toContain('Start a new run');
  expect(screen.queryByRole('button')).toBeNull();
});

it('announces interrupted opponent search politely', () => {
  mount({ loadStatus: 'loaded', notices: ['Your opponent search was interrupted by refresh. Your shop is unchanged.'] });
  expect(screen.getByRole('status').textContent).toContain('shop is unchanged');
});

it.each([
  ['unavailable', 'Retry storage access'], ['loaded', 'Retry save'],
] as const)('offers an accessible recovery button for %s storage', (loadStatus, label) => {
  const retry = mount({ loadStatus, blocked: true, error: 'Storage failed.' });
  expect(screen.getByRole('alert').textContent).toContain('Storage failed');
  expect(screen.getByText(/Gameplay is paused/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toContain('You can continue');
});

it('announces repeated failure and permits another explicit retry', () => {
  const retry = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  mount({ blocked: true, error: 'Storage full.' }, retry);
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(screen.getByRole('status').textContent).toContain('still unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(retry).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('status').textContent).toContain('You can continue');
});
