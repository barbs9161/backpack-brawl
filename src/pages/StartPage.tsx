import { useNavigate } from "react-router";
import { ROUTES, routeForGame } from "../game";
import { START_GOLD, START_LIVES, WINS_TO_VICTORY } from "../run";
import { useGame } from "../state/GameContext";

export function StartPage() {
  const { game, startNewRun, persistence } = useGame();
  const navigate = useNavigate();

  function handleNewRun() {
    if (startNewRun()) navigate(ROUTES.shop);
  }

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-lg border-2 border-gold bg-panel p-8 text-center">
      <p className="text-6xl" aria-hidden>
        🎒⚔️
      </p>
      <h2 className="font-display text-3xl font-bold">Pack your bag. Win the arena.</h2>
      <ul className="flex flex-col gap-1 text-muted">
        <li>🏪 Buy items in the shop and arrange them in your backpack.</li>
        <li>⚔️ Your items fight on their own — watch the battle unfold.</li>
        <li>
          🏆 Reach {WINS_TO_VICTORY} wins before you lose all {START_LIVES} lives. You start with {START_GOLD} 🪙.
        </li>
      </ul>
      {game && <button type="button" disabled={persistence.blocked} onClick={() => navigate(routeForGame(game))}
        className="rounded-md bg-gold px-5 py-2 font-display font-bold text-ink hover:brightness-110 disabled:opacity-60">Continue</button>}
      {game && <p id="replace-save" className="text-sm text-muted">Starting a new run replaces your saved run, including any unsubmitted result.</p>}
      <button type="button" onClick={handleNewRun} disabled={persistence.blocked} aria-describedby={game ? 'replace-save' : undefined}
        autoFocus={!game} className="rounded-md bg-gold px-5 py-2 font-display font-bold text-ink hover:brightness-110 disabled:opacity-60">
        🎒 New run
      </button>
    </section>
  );
}
