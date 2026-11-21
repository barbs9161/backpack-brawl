import { describe, expect, it } from 'vitest';
import { newGame, updateRun } from './game';
import { buyItem, sellItem, rerollShop } from './run';

// TEST 1: Trying to buy an item during the battle phase
describe('B1 - Shopping phase restrictions', () => {
  it('does not allow buying during battle', () => {
    // Create a new game.
    const game = newGame(123);
    // Give the player enough gold to buy something.
    const state = {
      ...game,
      phase: 'battle' as const,
      run: {
        ...game.run,
        gold: 100,
      },
    };
    // Attempt to buy the first shop offer.
    const result = updateRun(state, (run) => buyItem(run, 0));
    // The entire game state must remain unchanged.
    expect(result).toBe(state);
  });
});

// TEST 2: Trying to sell an item during the battle phase
it('does not allow selling during battle', () => {
  const game = newGame(123);
  const backpack = [...game.run.backpack];
  backpack[0] = {
    uid: 'item-1',
    itemId: 'iron-cleaver',
  };
  const state = {
    ...game,
    phase: 'battle' as const,
    run: {
      ...game.run,
      backpack,
    },
  };
  const result = updateRun(state, (run) => sellItem(run, 0));
  expect(result).toBe(state);
});

// TEST 3: Trying to reroll the shop during the battle phase
it('does not allow rerolling during battle', () => {
  const game = newGame(123);
  const state = {
    ...game,
    phase: 'battle' as const,
    run: {
      ...game.run,
      gold: 5,
    },
  };
  const result = updateRun(state, (run) => rerollShop(run));
  expect(result).toBe(state);
});
