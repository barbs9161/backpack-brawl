import { Link, Outlet } from "react-router";
import { ROUTES } from "../game";
import { PersistenceNotice } from "../components/PersistenceNotice";
import { useGame } from "../state/GameContext";

export function Layout() {
  const { persistence } = useGame();
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-panel-edge py-4">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          <Link to={ROUTES.start}>
            🎒 Backpack <span className="text-gold">Brawl</span>
          </Link>
        </h1>
        <nav aria-label="Main navigation">
          <Link to={ROUTES.hallOfFame} className="font-bold text-gold underline underline-offset-4">Hall of Fame</Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-4 py-6">
        <PersistenceNotice />
        <fieldset disabled={persistence.blocked} aria-label="Game controls"
          className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 disabled:opacity-60">
          <Outlet />
        </fieldset>
      </main>

      <footer className="border-t border-panel-edge py-3 text-xs tracking-wider text-muted">
        Backpack Brawl · practical exam starter
      </footer>
    </div>
  );
}
