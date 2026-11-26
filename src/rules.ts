import {
  HERO_BASE_HP,
  MAX_TICKS,
  TICK_SECONDS,
  POISON_TICK_INTERVAL,
  POISON_DAMAGE_PER_STACK,
  BURN_TICK_INTERVAL,
  BURN_DAMAGE_PER_STACK,
  BURN_DECAY_PER_TICK,
} from './battle';
import { ITEM_SETS } from './sets';
import { GOLD_PER_ROUND, START_GOLD, START_LIVES, WINS_TO_VICTORY } from './run';
import { BACKPACK_COLS, BACKPACK_ROWS, SHOP_SIZE } from './shop';
import type { ItemEffects } from './types';

/**
 * Player-facing explanations of the rules. Built from the game constants so
 * the texts stay correct when numbers are rebalanced.
 */

const BATTLE_SECONDS = MAX_TICKS * TICK_SECONDS;
const POISON_SECONDS = POISON_TICK_INTERVAL * TICK_SECONDS;
const BURN_SECONDS = BURN_TICK_INTERVAL * TICK_SECONDS;

/** Tooltip per item effect. */
export const EFFECT_HELP: Record<keyof ItemEffects, string> = {
  damage: 'Damage: hits the enemy. Block absorbs it first, the rest is lost from HP.',
  block:
    'Block: absorbs incoming damage until used up. Unused block stays for the rest of the battle.',
  poison: `Poison: adds stacks to the enemy. Each stack deals ${POISON_DAMAGE_PER_STACK} HP damage every ${POISON_SECONDS} s, ignoring block. Stacks accumulate and do not decay during battle.`,
  heal: "Heal: restores the item owner's HP without exceeding their maximum HP.",
  burn: `Burn: adds stacks to the enemy. Each stack deals ${BURN_DAMAGE_PER_STACK} damage every ${BURN_SECONDS} s. Block absorbs this damage first. After each Burn damage tick, ${BURN_DECAY_PER_TICK} stack(s) disappear, even if all damage is blocked.`,
};

export const COOLDOWN_HELP = `Cooldown: the item fires every time this much battle time has passed (1 tick = ${TICK_SECONDS} s).`;

/** Tooltip per fighter status shown in battle. */
export const STATUS_HELP = {
  hp: 'HP: reaching 0 is a knockout.',
  block: EFFECT_HELP.block,
  poison: EFFECT_HELP.poison,
  burn: EFFECT_HELP.burn,
  timer: `After ${BATTLE_SECONDS} s the fighter with the higher share of HP wins; a tie counts as your loss.`,
};

/** Tooltip per item set. */
export const SET_HELP = {
  fire: `Fire set: equip at least ${ITEM_SETS.fire.requiredItems} distinct Fire items to activate the bonus. Each Fire item activation applies ${ITEM_SETS.fire.bonus.burn} additional Burn stacks to the enemy.`,
  guardian: `Guardian set: equip at least ${ITEM_SETS.guardian.requiredItems} distinct Guardian items to activate the bonus. Each Guardian item activation grants ${ITEM_SETS.guardian.bonus.block} additional block.`,
};

export interface RuleSection {
  title: string;
  rules: string[];
}

export const RULES: RuleSection[] = [
  {
    title: '🏆 The run',
    rules: [
      `Reach ${WINS_TO_VICTORY} wins before you lose all ${START_LIVES} lives.`,
      `Each battle is one round: a win gives +1 win, a loss costs 1 life.`,
      `Opponents get tougher every round.`,
    ],
  },
  {
    title: '🏪 Shop & backpack',
    rules: [
      `You start with ${START_GOLD} 🪙 and earn ${GOLD_PER_ROUND} 🪙 at the start of every new round. Unspent gold carries over.`,
      `The shop offers ${SHOP_SIZE} new items every round.`,
      `Bought items go to the first free slot of your ${BACKPACK_COLS}×${BACKPACK_ROWS} backpack and stay there for the whole run.`,
      `Only items in your backpack fight. Their position doesn't matter.`,
    ],
  },
  {
    title: '⚔️ Battle',
    rules: [
      `Battles run on their own. Your hero has ${HERO_BASE_HP} HP; every item fires whenever its cooldown is up.`,
      `Damage hits block first; only the rest is lost from HP. Unused block stays for the rest of the battle.`,
      `Knock the enemy out to win. ${STATUS_HELP.timer} If both fall at once, you lose.`,
    ],
  },
  {
    title: '🧪 Status effects',
    rules: [
      EFFECT_HELP.poison,
      EFFECT_HELP.heal,
      EFFECT_HELP.burn,
      'Both the player and opponents can apply poison and Burn and use healing items.',
      'Both fighters start each battle with zero poison and Burn stacks.',
      'Poison damage is applied after item activations on scheduled poison ticks.',
      'Burn damage is applied after item activations and any scheduled poison damage, followed by Burn decay.',
      'New Burn stacks deal damage immediately on the tick in which they are applied.',
      'Healing can prevent a knockout within the same tick. Knockouts are checked after all item effects, periodic poison damage and Burn damage and decay have been resolved.',
    ],
  },
  {
    title: '🔥 Item sets',
    rules: [
      'Items belonging to a set display a set badge.',
      'A set bonus becomes active when the backpack contains enough distinct items from that set.',
      'Multiple copies of the same item do not count as distinct items.',
      'Once a set is active, every equipped item belonging to that set receives its bonus on each activation.',
      `Fire: collect at least ${ITEM_SETS.fire.requiredItems} distinct Fire items. Each Fire item activation applies ${ITEM_SETS.fire.bonus.burn} additional Burn stacks to the enemy.`,
      `Guardian: collect at least ${ITEM_SETS.guardian.requiredItems} distinct Guardian items. Each Guardian item activation grants ${ITEM_SETS.guardian.bonus.block} additional block.`,
      'Multiple set bonuses can be active simultaneously.',
      'Set bonuses apply equally to the player and opponents.',
      'Selling an item can deactivate a set bonus if the required number of distinct items is no longer equipped.',
    ],
  },
];
