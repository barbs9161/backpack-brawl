// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FightBar } from './FightBar';

afterEach(cleanup);

it('displays the API error without appending another retry message and permits retry', () => {
  const onFight = vi.fn();
  const error = 'Unable to reach the opponent API. Please try again.';
  render(<FightBar phase="shop" blocker={null} error={error} onFight={onFight} />);
  expect(screen.getByRole('alert').textContent?.trim()).toBe(`⚠️ ${error}`);
  fireEvent.click(screen.getByRole('button', { name: /Find opponent/ }));
  expect(onFight).toHaveBeenCalledTimes(1);
});
