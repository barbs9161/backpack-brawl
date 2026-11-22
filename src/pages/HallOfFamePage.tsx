import { useEffect, useState } from "react";
import { fetchLeaderboard } from "../api";
import type { LeaderboardEntry } from "../types";

type LeaderboardState =
  | { status: "loading" }
  | { status: "success"; entries: LeaderboardEntry[] }
  | { status: "error"; message: string };

export function HallOfFamePage() {
  const [state, setState] = useState<LeaderboardState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchLeaderboard(controller.signal).then(
      (entries) => {
        if (!controller.signal.aborted) setState({ status: "success", entries });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load the Hall of Fame. Please try again." });
        }
      },
    );
    return () => controller.abort();
  }, [attempt]);

  function handleRetry() {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-panel-edge bg-panel p-4">
      <h2 className="font-display text-2xl font-bold">Hall of Fame</h2>
      <p className="text-sm text-muted">Ranking: victories before defeats, then more wins, fewer rounds, and earlier accepted submissions. Equal timestamps are ordered by run ID, ascending.</p>
      {state.status === "loading" && <p role="status">Loading Hall of Fame…</p>}
      {state.status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-life">{state.message}</p>
          <button type="button" onClick={handleRetry} className="rounded-md bg-gold px-4 py-2 font-bold text-ink hover:brightness-110">Retry</button>
        </div>
      )}
      {state.status === "success" && (state.entries.length === 0 ? (
        <p role="status" className="text-muted">No finished runs yet. Complete a run to join the Hall of Fame.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-3 text-left font-bold">Best finished runs</caption>
            <thead><tr>{["Rank", "Player name", "Outcome", "Wins", "Rounds"].map((heading) => <th key={heading} scope="col" className="border-b border-panel-edge p-2">{heading}</th>)}</tr></thead>
            <tbody>
              {state.entries.map((entry, index) => (
                <tr key={entry.runId}>
                  <td className="p-2 font-mono">{index + 1}</td>
                  <th scope="row" className="p-2">{entry.playerName}</th>
                  <td className="p-2">{entry.outcome === "victory" ? "Victory" : "Defeat"}</td>
                  <td className="p-2">{entry.wins}</td>
                  <td className="p-2">{entry.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
