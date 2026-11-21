import { getItem } from './items';
import { BACKPACK_SIZE, rollShop } from './shop';
import type { RunState, Side } from './types';

export const START_GOLD = 10;
export const START_LIVES = 3;
export const WINS_TO_VICTORY = 5;
export const GOLD_PER_ROUND = 5;

export function newRun(seed: number): RunState {
  const roll = rollShop(seed);
  return {
    round: 1,
    gold: START_GOLD,
    lives: START_LIVES,
    wins: 0,
    seed: roll.seed,
    shop: roll.offers,
    backpack: Array(BACKPACK_SIZE).fill(null),
    nextUid: 1,
  };
}

export function firstFreeSlot(state: RunState): number {
  return state.backpack.indexOf(null);
}

/** Why an offer can't be bought right now, or `null` if it can. */
export function buyBlocker(state: RunState, offerIndex: number): string | null {
  const itemId = state.shop[offerIndex];
  if (!itemId) return 'Already sold';
  if (state.gold < getItem(itemId).price) return 'Not enough gold';
  if (firstFreeSlot(state) === -1) {
    // If there are no free slots in the backpack, return a message indicating that the backpack is full.
    return 'Backpack is full';
  }
  return null;
}

/** Why a backpack item can't be sold, or null if it can. This function only checks if something can be sold */
export function sellBlocker(state: RunState, slotIndex: number): string | null {
  // state: the current game state, including gold and backpack; slotIndex: the position of the item the player wants to sell.
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= state.backpack.length) {
    return 'Invalid backpack slot';
  }
  if (state.backpack[slotIndex] === null) {
    return 'Backpack slot is empty';
  }

  return null;
}

/** Sells a backpack item for half its price, rounded down. */
export function sellItem(state: RunState, slotIndex: number): RunState {
  if (sellBlocker(state, slotIndex) !== null) return state; // If the item can't be sold, return the unchanged state.
  const item = state.backpack[slotIndex]!; // The item in the specified backpack slot; the exclamation mark asserts that it's not null, since we already checked that in sellBlocker.
  const sellPrice = Math.floor(getItem(item.itemId).price / 2); // getItem() retrieves the item details, and we calculate half its price, rounded down.
  const backpack = [...state.backpack];
  backpack[slotIndex] = null; // Remove the item from the packpack by setting the slot to null, the original backpack remains unchanged due to the shallow copy.
  return {
    // Return a new state object with updated gold and backpack, keeping other properties unchanged.
    ...state,
    gold: state.gold + sellPrice,
    backpack,
  };
}

/** Buys a shop offer into the first free backpack slot; unchanged state if not allowed. */
export function buyItem(state: RunState, offerIndex: number): RunState {
  if (buyBlocker(state, offerIndex) !== null) return state;
  const itemId = state.shop[offerIndex]!;
  const slot = firstFreeSlot(state);
  const backpack = [...state.backpack]; //Contains the player's items, each with a unique uid and an itemId. Null means empty slot. [...] creates a shallow copy of the array instead of modifying the existing state.
  backpack[slot] = { uid: `item-${state.nextUid}`, itemId }; //Places the purchased item in the first free slot of the backpack, assigning it a unique uid based on the nextUid counter.
  const shop = [...state.shop];
  shop[offerIndex] = null;
  return {
    ...state,
    gold: state.gold - getItem(itemId).price,
    shop,
    backpack,
    nextUid: state.nextUid + 1,
  };
}

export type RunOutcome = 'victory' | 'defeat';

/** `victory` / `defeat` once the run is over, otherwise `null`. */
export function runOutcome(state: RunState): RunOutcome | null {
  if (state.wins >= WINS_TO_VICTORY) return 'victory';
  if (state.lives <= 0) return 'defeat';
  return null;
}

/** Why the player cannot reroll the shop, or null if allowed. */
export function rerollBlocker(state: RunState): string | null {
  if (state.gold < 1) return 'Not enough gold';
  return null;
}

/** Rerolls shop offers for 1 gold; leaves state unchanged if not allowed. */
export function rerollShop(state: RunState): RunState {
  if (rerollBlocker(state) !== null) return state;
  const roll = rollShop(state.seed);
  return {
    ...state,
    gold: state.gold - 1,
    shop: roll.offers,
    seed: roll.seed,
  };
}

/** Starts the next round: round + 1, round gold, fresh shop. The backpack is kept. */
export function startNextRound(state: RunState): RunState {
  const roll = rollShop(state.seed);
  return {
    ...state,
    round: state.round + 1,
    gold: state.gold + GOLD_PER_ROUND,
    seed: roll.seed,
    shop: roll.offers,
  };
}

/** Records a battle (win → +1 win, loss → −1 life) and moves on to the next round unless the run is over. */
export function applyBattleResult(state: RunState, winner: Side): RunState {
  const scored =
    winner === 'player' ? { ...state, wins: state.wins + 1 } : { ...state, lives: state.lives - 1 };
  return runOutcome(scored) ? scored : startNextRound(scored);
}
