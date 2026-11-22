import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLeaderboard, fetchOpponent, submitLeaderboardRun } from './api';
import type { LeaderboardEntry, LeaderboardSubmission } from './types';

const submission: LeaderboardSubmission = { runId: '00000000-0000-4000-8000-000000000001', playerName: 'Ada', wins: 5, lives: 2, rounds: 6 };
const entry: LeaderboardEntry = { ...submission, outcome: 'victory', createdAt: '2026-11-22T08:00:00.000Z' };
const mockResponse = (body: unknown, status = 200) => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
afterEach(() => vi.unstubAllGlobals());

describe('leaderboard API', () => {
  it.each([200, 201])('posts JSON and accepts success %i', async (status) => {
    const fetch = mockResponse({ entry }, status);
    expect(await submitLeaderboardRun(submission)).toEqual(entry);
    expect(fetch).toHaveBeenCalledWith('/api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submission) });
  });

  it('accepts server-normalized submission data', async () => {
    mockResponse({ entry });
    expect(await submitLeaderboardRun({ ...submission, playerName: ' Ada ' })).toEqual(entry);
  });

  it.each([{ entries: [] }, { entries: [entry] }])('gets entries and forwards an abort signal', async ({ entries }) => {
    const fetch = mockResponse({ entries });
    const signal = new AbortController().signal;
    expect(await fetchLeaderboard(signal)).toEqual(entries);
    expect(fetch).toHaveBeenCalledWith('/api/leaderboard', { signal });
  });

  for (const request of [() => fetchLeaderboard(), () => submitLeaderboardRun(submission)]) {
    it.each([400, 409, 500])('reports server error text for HTTP %i', async (status) => {
      mockResponse({ error: 'Readable server error' }, status);
      await expect(request()).rejects.toThrow('Readable server error');
    });

    it('handles a non-JSON HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Unavailable</html>', { status: 503 })));
      await expect(request()).rejects.toThrow('Leaderboard request failed (503)');
    });

    it.each([{ error: 42 }, { error: '' }, null])('handles malformed error bodies %j', async (body) => {
      mockResponse(body, 500);
      await expect(request()).rejects.toThrow('Leaderboard request failed (500)');
    });

    it('propagates network failures', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      await expect(request()).rejects.toThrow('Failed to fetch');
    });

    it('rejects non-JSON success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')));
      await expect(request()).rejects.toThrow(/Invalid leaderboard/);
    });
  }

  it.each([null, [], {}, { entries: null }, { entries: [{}] }, { entries: [entry, null] }])('rejects invalid list responses %j', async (body) => {
    mockResponse(body);
    await expect(fetchLeaderboard()).rejects.toThrow('Invalid leaderboard response.');
  });

  it.each([
    { runId: 'bad' }, { playerName: '' }, { playerName: 'A\nB' }, { wins: '5' },
    { lives: 1.5 }, { rounds: 5 }, { outcome: 'defeat' }, { createdAt: 'invalid' },
  ])('rejects malformed entry fields %j', async (changes) => {
    mockResponse({ entries: [{ ...entry, ...changes }] });
    await expect(fetchLeaderboard()).rejects.toThrow('Invalid leaderboard response.');
  });

  it.each([null, {}, { entry: null }, { entry: {} }])('rejects malformed submission responses %j', async (body) => {
    mockResponse(body);
    await expect(submitLeaderboardRun(submission)).rejects.toThrow('Invalid leaderboard submission response.');
  });

  it('rejects a response belonging to a different submission', async () => {
    mockResponse({ entry: { ...entry, playerName: 'Other' } });
    await expect(submitLeaderboardRun(submission)).rejects.toThrow('Invalid leaderboard submission response.');
  });

  it('propagates cancellation', async () => {
    const aborted = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));
    await expect(fetchLeaderboard(new AbortController().signal)).rejects.toBe(aborted);
  });
});

it('preserves the existing opponent request contract', async () => {
  const opponent = { id: 'test', name: 'Test', icon: '', hp: 25, round: 1, items: [] };
  const fetch = mockResponse(opponent);
  expect(await fetchOpponent(1)).toEqual(opponent);
  expect(fetch).toHaveBeenCalledWith('/api/opponents?round=1');
});
