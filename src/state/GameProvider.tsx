import { useEffect, useRef, useState, type ReactNode } from "react";
import { fightBlocker, newGame, searchFailed, startBattle, startSearch } from "../game";
import { fetchOpponent } from "../api";
import { loadSavedGame, normalizeRestoredGame, RULES_VERSION, saveGame, SAVE_VERSION, type LoadGameResult } from "../persistence";
import type { GameState } from "../types";
import { GameContext, type GameContextValue, type PersistenceState } from "./GameContext";

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

function feedbackForLoad(loaded: LoadGameResult): PersistenceState {
  return {
    loadStatus: loaded.status,
    notices: loaded.status === 'loaded' ? loaded.notices : [],
    error: 'message' in loaded ? loaded.message : null,
    blocked: loaded.status === 'unavailable',
    interruptedSubmission: loaded.status === 'loaded' ? loaded.interruptedSubmission : null,
  };
}

interface SaveCandidate {
  game: GameState;
  interruptedSubmission: PersistenceState['interruptedSubmission'];
}

/** Holds the game state for all routes, so it survives navigating between pages. */
export function GameProvider({ children }: { children: ReactNode }) {
  // Lazy reads are safe to repeat in StrictMode: no writes, UUIDs, or requests.
  // The restored game exists on the first child render, before route guards run.
  const [loaded] = useState(loadSavedGame);
  const [game, setGame] = useState<GameState | null>(() => loaded.status === 'loaded' ? loaded.game : null);
  const [persistence, setPersistence] = useState(() => feedbackForLoad(loaded));
  // All writes pass through replaceGame/updateGame. This mirror includes queued
  // actions before React commits a batch; it is never assigned during render.
  const currentGame = useRef<GameState | null>(game);
  const persistenceRef = useRef(persistence);
  const unsaved = useRef<SaveCandidate | null>(null);
  const mounted = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); };
  }, []);

  function publishFeedback(next: PersistenceState) {
    persistenceRef.current = next;
    setPersistence(next);
  }

  function publishGame(next: GameState) {
    currentGame.current = next;
    setGame(next);
  }

  function persistCandidate(candidate: SaveCandidate): boolean {
    // Keep interrupted intent durable across further refreshes until B7 resolves
    // it. The live game stays retryable; the stored pending form re-derives the
    // original payload on load, even if the live name has since been edited.
    const intent = candidate.interruptedSubmission;
    const snapshot = intent ? {
      ...candidate.game,
      leaderboardSubmission: { playerName: intent.playerName, status: 'submitting' as const, error: null, entry: null },
    } : candidate.game;
    const result = saveGame(snapshot);
    if (result.status === 'error') {
      unsaved.current = candidate;
      pending.current?.abort();
      pending.current = null;
      publishFeedback({ ...persistenceRef.current, blocked: true, error: result.message });
      return false;
    }
    unsaved.current = null;
    const replacingRun = candidate.game.runId !== currentGame.current?.runId;
    const resolvedSubmission = persistenceRef.current.interruptedSubmission !== null
      && candidate.interruptedSubmission === null;
    publishGame(candidate.game);
    publishFeedback({ ...persistenceRef.current, blocked: false, error: null,
      notices: replacingRun || resolvedSubmission ? [] : persistenceRef.current.notices,
      interruptedSubmission: candidate.interruptedSubmission });
    return true;
  }

  function replaceGame(next: GameState, submissionRejected = false): boolean {
    if (!mounted.current || persistenceRef.current.blocked || next === currentGame.current) return false;
    let interruptedSubmission = next.runId !== currentGame.current?.runId
      || next.leaderboardSubmission.status === 'success' ? null : persistenceRef.current.interruptedSubmission;
    if (submissionRejected && next.runId === currentGame.current?.runId && next.phase === 'finished'
      && currentGame.current.leaderboardSubmission.status === 'submitting'
      && next.leaderboardSubmission.status === 'error') interruptedSubmission = null;
    if (!interruptedSubmission && next.leaderboardSubmission.status === 'submitting') {
      interruptedSubmission = { runId: next.runId, playerName: next.leaderboardSubmission.playerName,
        wins: next.run.wins, lives: next.run.lives, rounds: next.run.round };
    }
    const candidate = { game: next, interruptedSubmission };
    if (persistCandidate(candidate)) return true;
    // Failed admission has issued no HTTP request. Retry must not install a
    // searching/submitting state with no live request or launch HTTP implicitly.
    if (next.phase === 'searching' || next.leaderboardSubmission.status === 'submitting') {
      const restored = normalizeRestoredGame({ version: SAVE_VERSION, rulesVersion: RULES_VERSION, game: next });
      unsaved.current = { game: restored.game,
        interruptedSubmission: interruptedSubmission ?? restored.interruptedSubmission };
    }
    return false;
  }

  function updateGame(transition: (current: GameState) => GameState, options?: { submissionRejected?: boolean }) {
    if (!mounted.current || persistenceRef.current.blocked) return false;
    const current = currentGame.current;
    return current ? replaceGame(transition(current), options?.submissionRejected) : false;
  }

  function retrySave(): boolean {
    if (!mounted.current) return false;
    if (unsaved.current) return persistCandidate(unsaved.current);
    if (persistenceRef.current.loadStatus === 'unavailable') {
      const retried = loadSavedGame();
      if (retried.status === 'loaded') publishGame(retried.game);
      publishFeedback(feedbackForLoad(retried));
      return retried.status !== 'unavailable';
    }
    return !persistenceRef.current.blocked;
  }

  async function findOpponent() {
    const current = currentGame.current;
    if (!mounted.current || persistenceRef.current.blocked || !current || game?.runId !== current.runId
      || pending.current || fightBlocker(current) !== null) return;
    const search = { searchId: crypto.randomUUID(), runId: current.runId, round: current.run.round };
    const admitted = startSearch(current, search);
    if (admitted === current) return;
    if (!replaceGame(admitted)) return;
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
    persistence,
    retrySave,
    startNewRun: () => {
      if (!mounted.current || persistenceRef.current.blocked) return false;
      pending.current?.abort();
      pending.current = null;
      return replaceGame(newGame(randomSeed(), crypto.randomUUID()));
    },
    findOpponent,
    update: updateGame,
  };

  return <GameContext value={value}>{children}</GameContext>;
}
