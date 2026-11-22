import { useRef } from "react";
import { Link } from "react-router";
import { submitLeaderboardRun } from "../api";
import { LeaderboardForm } from "../components/LeaderboardForm";
import { RunHeader } from "../components/RunHeader";
import { RunOver } from "../components/RunOver";
import { runOutcome } from "../run";
import { beginLeaderboardSubmission, leaderboardSubmissionFailed, leaderboardSubmissionSucceeded, ROUTES, setLeaderboardName } from "../game";
import { useActiveGame } from "../state/GameContext";

export function ResultPage() {
  const { game, startNewRun, update } = useActiveGame();
  const pendingRun = useRef<string | null>(null);
  const outcome = runOutcome(game.run);
  if (!outcome) return null;

  async function handleSubmit() {
    const { runId, run, leaderboardSubmission } = game;
    if (pendingRun.current === runId || !leaderboardSubmission.playerName.trim()
      || beginLeaderboardSubmission(game, runId) === game) return;
    const payload = { runId, playerName: leaderboardSubmission.playerName, wins: run.wins, lives: run.lives, rounds: run.round };
    pendingRun.current = runId;
    update((current) => beginLeaderboardSubmission(current, runId));
    try {
      const entry = await submitLeaderboardRun(payload);
      update((current) => leaderboardSubmissionSucceeded(current, runId, entry));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed. Please try again.";
      update((current) => leaderboardSubmissionFailed(current, runId, message));
    } finally {
      if (pendingRun.current === runId) pendingRun.current = null;
    }
  }

  // Starting a new run moves the phase to "shop", so RequireRoute redirects to the shop.
  return (
    <>
      <RunHeader run={game.run} />
      <RunOver run={game.run} outcome={outcome} onNewRun={startNewRun} />
      {game.phase === "finished" && (
        <LeaderboardForm
          playerName={game.leaderboardSubmission.playerName}
          status={game.leaderboardSubmission.status}
          error={game.leaderboardSubmission.error}
          onNameChange={(name) => update((current) => setLeaderboardName(current, name))}
          onSubmit={handleSubmit}
        />
      )}
      {game.phase === "finished" && <Link to={ROUTES.hallOfFame} className="self-center font-bold text-gold underline underline-offset-4">View Hall of Fame</Link>}
    </>
  );
}
