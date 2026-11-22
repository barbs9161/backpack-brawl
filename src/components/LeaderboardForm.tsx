import { useId, type FormEvent } from "react";
import type { LeaderboardSubmissionState } from "../types";

interface LeaderboardFormProps {
  playerName: string;
  status: LeaderboardSubmissionState["status"];
  error: string | null;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
}

export function LeaderboardForm({ playerName, status, error, onNameChange, onSubmit }: LeaderboardFormProps) {
  const nameId = useId();
  const locked = status === "submitting" || status === "success";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locked && playerName.trim()) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Submit run to Hall of Fame" className="mx-auto flex w-full max-w-lg flex-col gap-3 rounded-lg border border-panel-edge bg-panel p-6">
      <h2 className="font-display text-xl font-bold">Hall of Fame</h2>
      <label htmlFor={nameId} className="font-bold">Player name</label>
      <input
        id={nameId}
        name="playerName"
        value={playerName}
        onChange={(event) => onNameChange(event.target.value)}
        required
        maxLength={30}
        disabled={locked}
        className="rounded-md border border-panel-edge bg-ink p-2 disabled:opacity-60"
      />
      <button type="submit" disabled={locked || !playerName.trim()} className="rounded-md bg-gold px-4 py-2 font-bold text-ink hover:brightness-110 disabled:bg-panel-edge disabled:text-muted">
        {status === "submitting" ? "Submitting…" : status === "success" ? "Run submitted" : status === "error" ? "Retry submission" : "Submit run"}
      </button>
      {status === "submitting" && <p role="status" className="text-muted">Submitting your run…</p>}
      {status === "success" && <p role="status" className="text-gold">Your run was saved to the Hall of Fame.</p>}
      {status === "error" && <p role="alert" className="text-life">{error ?? "Submission failed. Please try again."}</p>}
    </form>
  );
}
