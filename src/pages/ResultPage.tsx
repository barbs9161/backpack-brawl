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
  const { game, startNewRun, update, persistence } = useActiveGame();
  const pendingRun = useRef<string | null>(null);
  const outcome = runOutcome(game.run);
  const intent = persistence.interruptedSubmission;
  if (!outcome) return null;

  async function handleSubmit() {
    const { runId, run, leaderboardSubmission } = game;
    if (persistence.blocked || pendingRun.current === runId || !(intent?.playerName ?? leaderboardSubmission.playerName).trim()
      || beginLeaderboardSubmission(game, runId) === game) return;
    const payload = intent ?? { runId, playerName: leaderboardSubmission.playerName, wins: run.wins, lives: run.lives, rounds: run.round };
    // The provider must durably admit intent before an external POST is allowed.
    if (!update((current) => current.runId !== payload.runId ? current
      : beginLeaderboardSubmission(setLeaderboardName(current, payload.playerName), payload.runId))) return;
    pendingRun.current = runId;
    try {
      const entry = await submitLeaderboardRun(payload);
      update((current) => leaderboardSubmissionSucceeded(current, runId, entry));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed. Please try again.";
      const submissionRejected = error instanceof Error && 'status' in error && error.status === 400;
      update((current) => leaderboardSubmissionFailed(current, runId, message), { submissionRejected });
    } finally {
      if (pendingRun.current === runId) pendingRun.current = null;
    }
  }

  // Starting a new run moves the phase to "shop", so RequireRoute redirects to the shop.
  return (
    <>
      <RunHeader run={game.run} />
      <RunOver run={game.run} outcome={outcome} onNewRun={startNewRun} />
      <p className="text-center text-sm text-muted">Starting a new run replaces this saved result, including any pending submission.</p>
      {game.phase === "finished" && (
        <LeaderboardForm
          playerName={intent?.playerName ?? game.leaderboardSubmission.playerName}
          status={game.leaderboardSubmission.status}
          error={game.leaderboardSubmission.error}
          uncertain={intent !== null && game.leaderboardSubmission.status !== 'submitting'}
          blocked={persistence.blocked}
          onNameChange={(name) => { if (!intent && !persistence.blocked) update((current) => setLeaderboardName(current, name)); }}
          onSubmit={handleSubmit}
        />
      )}
      {game.phase === "finished" && <Link to={ROUTES.hallOfFame} className="self-center font-bold text-gold underline underline-offset-4">View Hall of Fame</Link>}
    </>
  );
}
