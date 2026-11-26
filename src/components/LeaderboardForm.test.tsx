// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LeaderboardForm } from './LeaderboardForm';

afterEach(cleanup);

it('labels a controlled required input and forwards edits', () => {
  const change = vi.fn();
  render(<LeaderboardForm playerName="Ada" status="idle" error={null} onNameChange={change} onSubmit={vi.fn()} />);
  const input = screen.getByRole('textbox', { name: 'Player name' }) as HTMLInputElement;
  expect(input.value).toBe('Ada');
  expect(input.required).toBe(true);
  expect(input.maxLength).toBe(30);
  fireEvent.change(input, { target: { value: 'Grace' } });
  expect(change).toHaveBeenCalledWith('Grace');
});

it.each(['', '   '])('blocks an empty name %j even if the form is submitted directly', (playerName) => {
  const submit = vi.fn();
  render(<LeaderboardForm playerName={playerName} status="idle" error={null} onNameChange={vi.fn()} onSubmit={submit} />);
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(screen.getByRole('form'));
  expect(submit).not.toHaveBeenCalled();
});

it('submits a valid name', () => {
  const submit = vi.fn();
  render(<LeaderboardForm playerName="Ada" status="idle" error={null} onNameChange={vi.fn()} onSubmit={submit} />);
  fireEvent.click(screen.getByRole('button', { name: 'Submit run' }));
  expect(submit).toHaveBeenCalledTimes(1);
});

it.each(['submitting', 'success'] as const)('locks controls and announces %s', (status) => {
  const submit = vi.fn();
  render(<LeaderboardForm playerName="Ada" status={status} error={null} onNameChange={vi.fn()} onSubmit={submit} />);
  expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain(status === 'success' ? 'saved' : 'Submitting');
  fireEvent.submit(screen.getByRole('form'));
  expect(submit).not.toHaveBeenCalled();
});

it('retains the controlled name and permits retry after error', () => {
  const submit = vi.fn();
  function Form() {
    const [name, setName] = useState('Ada');
    return <LeaderboardForm playerName={name} status="error" error="Network unavailable" onNameChange={setName} onSubmit={submit} />;
  }
  render(<Form />);
  expect(screen.getByRole('alert').textContent).toBe('Network unavailable');
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Ada');
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }));
  expect(submit).toHaveBeenCalledTimes(1);
});

it('locks an uncertain name but permits explicit retry with accessible explanation', () => {
  const submit = vi.fn();
  const change = vi.fn();
  render(<LeaderboardForm playerName=" Ada " status="error" error="Interrupted" uncertain
    onNameChange={change} onSubmit={submit} />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  expect(input.disabled).toBe(true);
  expect(input.value).toBe(' Ada ');
  expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toContain('original name');
  fireEvent.change(input, { target: { value: 'Changed' } });
  expect(change).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'Retry submission' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.submit(screen.getByRole('form'));
  expect(submit).toHaveBeenCalledTimes(1);
});

it('blocks edits and direct form submission during a pending save failure', () => {
  const submit = vi.fn();
  const change = vi.fn();
  render(<LeaderboardForm playerName="Ada" status="error" error="Offline" blocked
    onNameChange={change} onSubmit={submit} />);
  expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Changed' } });
  fireEvent.submit(screen.getByRole('form'));
  expect(submit).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
});
