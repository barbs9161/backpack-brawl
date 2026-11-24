import { Backpack } from '../components/Backpack';
import { FightBar } from '../components/FightBar';
import { RulesPanel } from '../components/RulesPanel';
import { RunHeader } from '../components/RunHeader';
import { Shop } from '../components/Shop';
import { fightBlocker, updateRun } from '../game';
import { buyItem, sellItem, rerollShop, moveItem } from '../run';
import { useActiveGame } from '../state/GameContext';
import { useState } from 'react';

export function ShopPage() {
  const { game, update, findOpponent } = useActiveGame();
  const { run, phase } = game;
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  function handleBuy(offerIndex: number) {
    update((current) => updateRun(current, (currentRun) => buyItem(currentRun, offerIndex)));
  }

  //slotIndex: the position of the item in the backpack that the player wants to sell.
  //update() tells React to update the game state.
  //updateRun() takes the current game state and applies the sellItem() function to it, returning a new game state with the item sold and gold updated.
  //sellItem() performs the actual selling operation, which happens in run.ts. UI triggers the action, but game logic calculates the new state.
  function handleSell(slotIndex: number) {
    update((current) => updateRun(current, (currentRun) => sellItem(currentRun, slotIndex)));
    if (selectedSlot === slotIndex) {
      setSelectedSlot(null);
    }
  }

  //handleReroll() runs when the player clicks the Reroll button
  //update( tells React to update the game state
  //updateRun() ensures the action only happens during the shoping phase
  //rerollShop() checks whether the player has at least 1 gold, deducts it, and generates new offers.
  function handleReroll() {
    update((current) => updateRun(current, (currentRun) => rerollShop(currentRun)));
  }

  //handleMove() runs when the player drags an item from one backpack slot to another
  //update() tells React to update the game state
  //updateRun() ensures the action only happens during the shoping phase
  //moveItem() checks whether the move is valid, and if so, swaps the items in the backpack.
  function handleMove(fromIndex: number, toIndex: number) {
    update((current) =>
      updateRun(current, (currentRun) => moveItem(currentRun, fromIndex, toIndex)),
    );
  }

  function handleFight() {
    setSelectedSlot(null);
    return findOpponent();
  }

  return (
    <>
      <RunHeader run={run} />
      <FightBar
        phase={phase}
        blocker={fightBlocker(game)}
        error={game.error}
        onFight={handleFight}
      />

      {/* While searching, the whole shop/backpack area is disabled so the fighting build can't change. */}
      <fieldset
        disabled={phase !== 'shop'}
        className="grid min-w-0 gap-4 disabled:opacity-60 lg:grid-cols-[1fr_16rem_18rem]"
      >
        <Shop run={run} onBuy={handleBuy} onReroll={handleReroll} />
        <Backpack
          backpack={run.backpack}
          onSell={handleSell}
          selectedSlot={selectedSlot}
          onSelect={setSelectedSlot}
          onMove={handleMove}
        />{' '}
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
