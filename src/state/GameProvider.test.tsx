import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import * as gameModule from '../game';
import { useGame } from './GameContext';
import { GameProvider } from './GameProvider';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('generates a fresh UUID only when startNewRun is invoked', () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  const firstId = '00000000-0000-4000-8000-000000000001';
  const secondId = '00000000-0000-4000-8000-000000000002';
  const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
  const newGame = vi.spyOn(gameModule, 'newGame');
  let startNewRun: () => void = () => { throw new Error('Provider not rendered'); };
  function Consumer() {
    startNewRun = useGame().startNewRun;
    return null;
  }
  renderToStaticMarkup(<GameProvider><Consumer /></GameProvider>);
  expect(uuid).not.toHaveBeenCalled();
  startNewRun();
  startNewRun();
  expect(uuid).toHaveBeenCalledTimes(2);
  expect(newGame.mock.results.map((result) => result.value.runId)).toEqual([firstId, secondId]);
});
