import { fetchOpponent } from '../api';
import { Backpack } from '../components/Backpack';
import { FightBar } from '../components/FightBar';
import { RulesPanel } from '../components/RulesPanel';
import { RunHeader } from '../components/RunHeader';
import { Shop } from '../components/Shop';
import { fightBlocker, searchFailed, startBattle, startSearch, updateRun } from '../game';
import { buyItem, sellItem, rerollShop } from '../run';
import { useActiveGame } from '../state/GameContext';

export function ShopPage() {
  const { game, update } = useActiveGame();
  const { run, phase } = game;

  function handleBuy(offerIndex: number) {
    update((current) => updateRun(current, (currentRun) => buyItem(currentRun, offerIndex)));
  }

  //slotIndex: the position of the item in the backpack that the player wants to sell.
  //update() tells React to update the game state.
  //updateRun() takes the current game state and applies the sellItem() function to it, returning a new game state with the item sold and gold updated.
  //sellItem() performs the actual selling operation, which happens in run.ts. UI triggers the action, but game logic calculates the new state.
  function handleSell(slotIndex: number) {
    update((current) => updateRun(current, (currentRun) => sellItem(currentRun, slotIndex)));
  }

  //handleReroll() runs when the player clicks the Reroll button
  //update( tells React to update the game state
  //updateRun() ensures the action only happens during the shoping phase
  //rerollShop() checks whether the player has at least 1 gold, deducts it, and generates new offers.
  function handleReroll() {
    update((current) => updateRun(current, (currentRun) => rerollShop(currentRun)));
  }

  // Once the opponent is found the phase becomes "battle" and RequireRoute redirects to the battle page.
  async function handleFindOpponent() {
    if (fightBlocker(game) !== null) return;
    update(startSearch);
    try {
      const opponent = await fetchOpponent(run.round);
      update((current) => startBattle(current, opponent));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Opponent search failed.';
      update((current) => searchFailed(current, message));
    }
  }

  return (
    <>
      <RunHeader run={run} />
      <FightBar
        phase={phase}
        blocker={fightBlocker(game)}
        error={game.error}
        onFight={handleFindOpponent}
      />

      {/* While searching, the whole shop/backpack area is disabled so the fighting build can't change. */}
      <fieldset
        disabled={phase !== 'shop'}
        className="grid min-w-0 gap-4 disabled:opacity-60 lg:grid-cols-[1fr_16rem_18rem]"
      >
        <Shop run={run} onBuy={handleBuy} onReroll={handleReroll} />
        <Backpack backpack={run.backpack} onSell={handleSell} />{' '}
        {/*The onSell prop is passed to the
        Backpack component, allowing it to call handleSell when a player clicks the sell button for
        an item in the backpack. This enables the ShopPage to manage the selling logic and update
        the game state accordingly. */}
        <aside className="flex flex-col gap-4">
          <RulesPanel open={run.round === 1} />
        </aside>
      </fieldset>
    </>
  );
}
