import { CATALOG } from './items';
import type { Opponent } from './types';

/** Shared runtime guard for HTTP responses and pure battle admission. */
export function isOpponent(value: unknown): value is Opponent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const opponent = value as Record<string, unknown>;
  return typeof opponent.id === 'string' && opponent.id.trim().length > 0
    && typeof opponent.name === 'string' && opponent.name.trim().length > 0
    && typeof opponent.icon === 'string'
    && typeof opponent.hp === 'number' && Number.isSafeInteger(opponent.hp) && opponent.hp > 0
    && typeof opponent.round === 'number' && Number.isSafeInteger(opponent.round) && opponent.round > 0
    && Array.isArray(opponent.items) && opponent.items.length <= 6
    && opponent.items.every((id) => typeof id === 'string' && CATALOG.some((item) => item.id === id));
}
