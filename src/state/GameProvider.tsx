import { useEffect, useRef, useState, type ReactNode } from "react";
import { fightBlocker, newGame, searchFailed, startBattle, startSearch } from "../game";
import { fetchOpponent } from "../api";
import type { GameState } from "../types";
import { GameContext, type GameContextValue } from "./GameContext";

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

/** Holds the game state for all routes, so it survives navigating between pages. */
export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameState | null>(null);
  // All writes pass through replaceGame/updateGame. This mirror includes queued
  // actions before React commits a batch; it is never assigned during render.
  const currentGame = useRef<GameState | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);

  function replaceGame(next: GameState | null) {
    currentGame.current = next;
    setGame(next);
  }

  function updateGame(transition: (current: GameState) => GameState) {
    const current = currentGame.current;
    if (current) replaceGame(transition(current));
  }

  async function findOpponent() {
    const current = currentGame.current;
    if (!current || game?.runId !== current.runId || pending.current || fightBlocker(current) !== null) return;
    const search = { searchId: crypto.randomUUID(), runId: current.runId, round: current.run.round };
    const admitted = startSearch(current, search);
    if (admitted === current) return;
    replaceGame(admitted);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const opponent = await fetchOpponent(search.round, controller.signal);
      if (!controller.signal.aborted) updateGame((latest) => startBattle(latest, search, opponent));
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : 'Opponent search failed. Please try again.';
        updateGame((latest) => searchFailed(latest, search, message));
      }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  const value: GameContextValue = {
    game,
    startNewRun: () => {
      pending.current?.abort();
      pending.current = null;
      replaceGame(newGame(randomSeed(), crypto.randomUUID()));
    },
    findOpponent,
    update: updateGame,
  };

  return <GameContext value={value}>{children}</GameContext>;
}
