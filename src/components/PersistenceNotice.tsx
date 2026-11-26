import { useState } from 'react';
import { useGame } from '../state/GameContext';

/** Shared recovery controls remain outside the disabled page fieldset. */
export function PersistenceNotice() {
  const { persistence, retrySave } = useGame();
  const [hasRetried, setHasRetried] = useState(false);
  const readFailure = persistence.loadStatus === 'unavailable';

  function handleRetry() {
    retrySave();
    setHasRetried(true);
  }

  return (
    <section aria-label="Save and resume" className="flex flex-col gap-3 rounded-lg border border-panel-edge bg-panel p-4 text-sm">
      {persistence.error && <div role="alert" className="text-life">
        <p>{persistence.error}</p>
        {!persistence.blocked && <p>Your saved run could not be restored. Start a new run to replace it.</p>}
      </div>}
      {persistence.blocked && <>
        <p>Gameplay is paused until browser storage recovers. Keep this page open to retain any pending change.</p>
        <button type="button" onClick={handleRetry}
          className="self-start rounded-md bg-gold px-4 py-2 font-bold text-ink hover:brightness-110">
          {readFailure ? 'Retry storage access' : 'Retry save'}
        </button>
      </>}
      {persistence.notices.map((notice, index) => <p key={`${index}-${notice}`} role="status">{notice}</p>)}
      {hasRetried && <p role="status">{persistence.blocked
        ? 'Browser storage is still unavailable. Keep this page open, allow storage, and try again.'
        : 'Browser storage is ready. You can continue.'}</p>}
      <details className="text-muted">
        <summary className="cursor-pointer font-bold text-gold">Save and refresh policy</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li>Your run saves automatically in this browser. Continue returns to its matching screen.</li>
          <li>Refreshing during an opponent search returns to the unchanged shop. Retry explicitly; each round has a fixed opponent.</li>
          <li>Refreshing during battle resumes the same opponent and replay frame. Results, losses, and round rewards apply once.</li>
          <li>Interrupted Hall of Fame submissions need an explicit retry with their original name and run. Successful submissions stay locked.</li>
          <li>Use one game tab. Clearing browser data removes the saved run; saves do not transfer between browsers.</li>
        </ul>
      </details>
    </section>
  );
}
