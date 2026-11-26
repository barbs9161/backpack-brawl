import { createContext, useContext } from "react";
import type { GameState, LeaderboardSubmission } from "../types";
import type { LoadGameResult } from "../persistence";

export interface PersistenceState {
  loadStatus: LoadGameResult['status'];
  notices: string[];
  error: string | null;
  /** Synchronous guards enforce this even before React commits a render. */
  blocked: boolean;
  interruptedSubmission: LeaderboardSubmission | null;
}

export interface GameContextValue {
  /** The current run, or `null` before the first run was started. */
  game: GameState | null;
  /** Replaces the current run only after its fresh snapshot is saved. */
  startNewRun: () => boolean;
  findOpponent: () => Promise<void>;
  /** True only when a changed state was saved and admitted. Check before external effects. */
  update: (transition: (game: GameState) => GameState, options?: {
    /** Only a confirmed HTTP validation rejection can release uncertain intent. */
    submissionRejected?: boolean;
  }) => boolean;
  persistence: PersistenceState;
  /** Retries the retained candidate, or retries an unavailable initial storage read. */
  retrySave: () => boolean;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used inside <GameProvider>");
  return context;
}

/** Like `useGame`, for pages that are only reachable with a run in progress (see `RequireRoute`). */
export function useActiveGame(): GameContextValue & { game: GameState } {
  const context = useGame();
  if (!context.game) throw new Error("No run in progress");
  return { ...context, game: context.game };
}
