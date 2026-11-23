import { afterEach, expect, it, vi } from 'vitest';
import { fetchOpponent, OPPONENT_TIMEOUT_MS } from './api';

const opponent = { id: 'test', name: 'Test', icon: '', hp: 25, round: 1, items: ['chipped-dagger'] };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('accepts valid opponents and passes cancellation to fetch', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(opponent)));
  vi.stubGlobal('fetch', fetch);
  expect(await fetchOpponent(1)).toEqual(opponent);
  expect(fetch).toHaveBeenCalledWith('/api/opponents?round=1', { signal: expect.any(AbortSignal) });
});

it.each([
  null, {}, { ...opponent, round: 2 }, { ...opponent, hp: -1 }, { ...opponent, hp: '25' },
  { ...opponent, round: 1.5 }, { ...opponent, items: ['missing'] }, { ...opponent, items: null },
  { ...opponent, items: Array(7).fill('chipped-dagger') }, { ...opponent, name: '' }, { ...opponent, id: 42 },
])('rejects malformed success %j', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
  await expect(fetchOpponent(1)).rejects.toThrow('Invalid opponent response');
});

it('rejects non-JSON success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json')));
  await expect(fetchOpponent(1)).rejects.toThrow('Invalid opponent response');
});

it.each([400, 503])('preserves readable HTTP %i errors', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Arena unavailable' }), { status })));
  await expect(fetchOpponent(1)).rejects.toThrow('Arena unavailable');
});

it('provides a non-JSON error fallback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));
  await expect(fetchOpponent(1)).rejects.toThrow('Opponent search failed (502)');
});

it('explains network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
  await expect(fetchOpponent(1)).rejects.toThrow('Unable to reach the opponent API');
});

function pendingFetch() {
  const fetch = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    if (options.signal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
  }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

it('times out once after eight seconds and clears its timer', async () => {
  vi.useFakeTimers();
  const fetch = pendingFetch();
  const request = expect(fetchOpponent(1)).rejects.toThrow('timed out after 8 seconds');
  await vi.advanceTimersByTimeAsync(OPPONENT_TIMEOUT_MS);
  await request;
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([false, true])('cancels an external signal (already aborted: %s)', async (alreadyAborted) => {
  pendingFetch();
  const controller = new AbortController();
  if (alreadyAborted) controller.abort();
  const request = expect(fetchOpponent(1, controller.signal)).rejects.toThrow('cancelled');
  controller.abort();
  await request;
});
