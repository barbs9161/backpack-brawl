import type { ItemSetDef, ItemSetId } from './types';
import { getItem } from './items';

export const ITEM_SETS: Record<ItemSetId, ItemSetDef> = {
  fire: {
    id: 'fire',
    name: 'Fire',
    icon: '🔥',
    requiredItems: 2,
    bonus: { burn: 4 },
  },
  guardian: {
    id: 'guardian',
    name: 'Guardian',
    icon: '🛡️',
    requiredItems: 2,
    bonus: { block: 2 },
  },
};

/** Returns the active set bonuses for a collection of equipped items. */
export function getActiveSets(itemIds: string[]): ItemSetId[] {
  const uniqueItemIds = [...new Set(itemIds)];

  return Object.values(ITEM_SETS)
    .filter((set) => {
      const count = uniqueItemIds.filter((itemId) => getItem(itemId).setId === set.id).length;

      return count >= set.requiredItems;
    })
    .map((set) => set.id);
}
