import type { ItemDef, ItemEffects } from './types';

export const CATALOG: ItemDef[] = [
  {
    id: 'chipped-dagger',
    name: 'Chipped Dagger',
    icon: '🗡️',
    price: 2,
    cooldown: 4,
    effects: { damage: 3 },
  },
  {
    id: 'hunting-bow',
    name: 'Hunting Bow',
    icon: '🏹',
    price: 4,
    cooldown: 4,
    effects: { damage: 5 },
  },
  {
    id: 'iron-cleaver',
    name: 'Iron Cleaver',
    icon: '🪓',
    price: 5,
    cooldown: 8,
    effects: { damage: 12 },
  },
  {
    id: 'oak-buckler',
    name: 'Oak Buckler',
    icon: '🛡️',
    price: 3,
    cooldown: 5,
    effects: { block: 4 },
    setId: 'guardian',
  },
  {
    id: 'pot-lid',
    name: 'Pot Lid',
    icon: '🍳',
    price: 2,
    cooldown: 3,
    effects: { block: 2 },
    setId: 'guardian',
  },
  {
    id: 'spiked-shield',
    name: 'Spiked Shield',
    icon: '⚔️',
    price: 4,
    cooldown: 6,
    effects: { damage: 3, block: 3 },
    setId: 'guardian',
  },
  // Poison items
  {
    id: 'poisoned-dagger',
    name: 'Poisoned Dagger',
    icon: '🗡️',
    price: 3,
    cooldown: 4,
    effects: { poison: 1 },
  },
  {
    id: 'venom-flask',
    name: 'Venom Flask',
    icon: '🧪',
    price: 4,
    cooldown: 6,
    effects: { poison: 2 },
  },
  {
    id: 'serpent-fang',
    name: 'Serpent Fang',
    icon: '🐍',
    price: 5,
    cooldown: 8,
    effects: { poison: 3 },
  },

  // Healing items
  {
    id: 'healing-herb',
    name: 'Healing Herb',
    icon: '🌿',
    price: 2,
    cooldown: 4,
    effects: { heal: 2 },
  },
  {
    id: 'healing-potion',
    name: 'Healing Potion',
    icon: '🧴',
    price: 4,
    cooldown: 6,
    effects: { heal: 4 },
  },
  {
    id: 'life-crystal',
    name: 'Life Crystal',
    icon: '💎',
    price: 5,
    cooldown: 8,
    effects: { heal: 6 },
  },
  // Fire set items
  {
    id: 'flame-dagger',
    name: 'Flame Dagger',
    icon: '🔥',
    price: 3,
    cooldown: 4,
    effects: { damage: 3 },
    setId: 'fire',
  },
  {
    id: 'ember-staff',
    name: 'Ember Staff',
    icon: '🪄',
    price: 4,
    cooldown: 6,
    effects: { damage: 5 },
    setId: 'fire',
  },
  {
    id: 'dragon-fang',
    name: 'Dragon Fang',
    icon: '🐉',
    price: 5,
    cooldown: 8,
    effects: { damage: 8 },
    setId: 'fire',
  },
];

const byId = new Map(CATALOG.map((item) => [item.id, item]));

export function getItem(id: string): ItemDef {
  const item = byId.get(id);
  if (!item) throw new Error(`Unknown item: ${id}`);
  return item;
}

const EFFECT_LABELS: [keyof ItemEffects, (n: number) => string][] = [
  ['damage', (n) => `⚔️ ${n} dmg`],
  ['block', (n) => `🛡️ +${n} block`],
  ['poison', (n) => `☠️ +${n} poison`],
  ['heal', (n) => `💚 +${n} HP`],
  ['burn', (n) => `🔥 +${n} burn`],
];

/** Short labels for an item's effects, e.g. `[{ effect: "damage", label: "⚔️ 2 dmg" }, …]`. */
export function describeEffects(
  effects: ItemEffects,
): { effect: keyof ItemEffects; label: string }[] {
  return EFFECT_LABELS.flatMap(([effect, label]) =>
    effects[effect] ? [{ effect, label: label(effects[effect]) }] : [],
  );
}
