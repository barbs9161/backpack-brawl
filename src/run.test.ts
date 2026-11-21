import { describe, expect, it } from 'vitest';
import { buyItem, newRun, rerollShop, sellItem } from './run';

describe('B1 - Selling items', () => {
  // TEST 1: Selling an item successfully
  it('sells an item for half its price, rounded down', () => {
    const run = newRun(123);

    const backpack = [...run.backpack];
    backpack[0] = {
      uid: 'item-1',
      itemId: 'iron-cleaver',
    };

    const state = {
      ...run,
      gold: 5,
      backpack,
    };

    const result = sellItem(state, 0);

    expect(result.gold).toBe(7);
    expect(result.backpack[0]).toBeNull();
  });

  // TEST 2: Trying to sell an empty slot
  it('does not change the state when selling an empty slot', () => {
    const run = newRun(123);
    const result = sellItem(run, 0);
    expect(result).toBe(run);
  });
});

// TEST 3: Trying to buy an item when the backpack is full
it('does not buy an item when the backpack is full', () => {
  const run = newRun(123);
  // Fill every backpack slot with an item.
  const fullBackpack = run.backpack.map((_, index) => ({
    uid: `item-${index}`,
    itemId: 'iron-cleaver',
  }));
  const state = {
    ...run,
    gold: 100,
    backpack: fullBackpack,
  };
  // Attempt to buy the first shop offer.
  const result = buyItem(state, 0);
  // The purchase must be rejected.
  expect(result).toBe(state);
});

// TEST 4: Trying to reroll the shop when the player has no gold
it('does not reroll the shop when the player has no gold', () => {
  const run = newRun(123);

  const state = {
    ...run,
    gold: 0,
  };
  const result = rerollShop(state);
  expect(result).toBe(state);
});

// TEST 5: Rerolling the shop successfully & the reroll costs only 1 gold
it('deducts exactly 1 gold when rerolling the shop', () => {
  const run = newRun(123);
  const state = {
    ...run,
    gold: 5,
  };
  const result = rerollShop(state);
  expect(result.gold).toBe(4);
  expect(result.seed).not.toBe(state.seed);
  expect(result).not.toBe(state);
});

// TEST 6: Buying an item successfully
it('buys an item and updates the state correctly', () => {
  const run = newRun(123);
  const state = {
    ...run,
    gold: 100,
    shop: ['iron-cleaver', ...run.shop.slice(1)],
  };
  const result = buyItem(state, 0);
  expect(result.gold).toBe(95);
  expect(result.backpack[0]?.itemId).toBe('iron-cleaver');
  expect(result.shop[0]).toBeNull();
  expect(result.nextUid).toBe(state.nextUid + 1);
});

// TEST 7: Ensuring that selling an item does not modify the original backpack state
it('does not modify the original backpack when selling', () => {
  const run = newRun(123);
  const backpack = [...run.backpack];
  backpack[0] = {
    uid: 'item-1',
    itemId: 'iron-cleaver',
  };
  const state = {
    ...run,
    backpack,
  };
  const result = sellItem(state, 0);
  // The new state has an empty slot.
  expect(result.backpack[0]).toBeNull();
  // The original state still contains the item.
  expect(state.backpack[0]?.itemId).toBe('iron-cleaver');
  // The backpack arrays are different objects.
  expect(result.backpack).not.toBe(state.backpack);
});

// TEST 8: Ensuring that buying an item does not modify the original shop state
it('does not buy an item when the player has insufficient gold', () => {
  const run = newRun(123);
  const state = {
    ...run,
    gold: 0,
    shop: ['iron-cleaver', ...run.shop.slice(1)],
  };
  const result = buyItem(state, 0);
  expect(result).toBe(state);
  expect(result.gold).toBe(0);
});

// TEST 9: Ensuring that selling an item from an invalid backpack slot does not change the state
it('does not sell an item from an invalid backpack slot', () => {
  const run = newRun(123);
  const result = sellItem(run, -1);
  expect(result).toBe(run);
});
