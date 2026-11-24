import { TICK_SECONDS } from '../battle';
import { describeEffects, getItem } from '../items';
import { BACKPACK_COLS } from '../shop';
import type { Backpack as BackpackSlots, ItemDef } from '../types';

/** Hover text for a backpack slot: name, effects and cooldown. */
const tooltip = (item: ItemDef) =>
  [
    item.name,
    ...describeEffects(item.effects).map(({ label }) => label),
    `⏱️ every ${item.cooldown * TICK_SECONDS}s`,
  ].join('\n');

export function Backpack({
  backpack,
  onSell,
  selectedSlot,
  onSelect,
  onMove,
}: {
  backpack: BackpackSlots;
  onSell?: (slotIndex: number) => void;
  selectedSlot?: number | null;
  onSelect?: (slotIndex: number | null) => void;
  onMove?: (fromIndex: number, toIndex: number) => void;
}) {
  function handleSlotClick(slotIndex: number) {
    if (!onSelect) return; // If no onSelect callback is provided, do nothing. If it was provided by the parent component.
    // If no item is selected, select an occupied slot.
    if (selectedSlot == null) {
      if (backpack[slotIndex] !== null) {
        onSelect(slotIndex);
      }
      return;
    }
    // Clicking the selected slot cancels the selection.
    if (selectedSlot === slotIndex) {
      onSelect(null);
      return;
    }
    // Move or swap the selected item.
    if (onMove) {
      onMove(selectedSlot, slotIndex);
      onSelect(null);
    }
  }
  return (
    <section className="rounded-lg border border-panel-edge bg-panel p-4">
      <h2 className="font-display text-xl font-bold">🎒 Backpack</h2>
      <p className="mb-3 text-sm text-muted">Hover an item to see its stats.</p>
      {selectedSlot != null && onSelect && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="rounded border border-gold px-3 py-1 text-sm text-gold"
        >
          Cancel selection
        </button>
      )}
      <ul
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${BACKPACK_COLS}, minmax(0, 1fr))` }}
      >
        {backpack.map((slot, index) => {
          const item = slot ? getItem(slot.itemId) : null;
          const isSelected = selectedSlot === index;
          const isValidDestination = selectedSlot != null && !isSelected && onMove != null;
          return (
            <li
              key={slot?.uid ?? `empty-${index}`}
              title={item ? tooltip(item) : undefined}
              aria-label={item ? item.name : `Empty slot ${index + 1}`}
              className={[
                'flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 p-1',
                item ? 'cursor-help border-gold/40 bg-ink/40' : 'border-dashed border-panel-edge',
                isSelected ? 'ring-2 ring-gold bg-gold/20' : '',
                isValidDestination ? 'ring-2 ring-green-400' : '',
              ].join(' ')}
            >
              {!item && selectedSlot != null && onMove && (
                <button
                  type="button"
                  onClick={() => handleSlotClick(index)}
                  className="rounded bg-ink px-2 py-1 text-xs text-white"
                >
                  Move here
                </button>
              )}
              {item && (
                <>
                  <span className="text-3xl leading-none sm:text-4xl" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="text-center text-xs leading-tight">{item.name}</span>
                  {onSelect && (
                    <button
                      type="button"
                      onClick={() => handleSlotClick(index)}
                      aria-pressed={isSelected}
                      className="rounded bg-ink px-2 py-1 text-xs text-white"
                    >
                      {isSelected ? 'Selected' : selectedSlot != null ? 'Swap' : 'Select'}
                    </button>
                  )}
                  {onSell && (
                    <button
                      type="button"
                      onClick={() => onSell(index)} // Calls the onSell callback with the index of the backpack slot when the sell button is clicked, allowing the parent component to handle the selling logic.
                      className="rounded bg-red-700 px-2 py-1 text-xs text-white hover:bg-red-600"
                    >
                      {/* Displays the sell price of the item, which is half of its original price, rounded down. */}
                      Sell 🪙{Math.floor(item.price / 2)}
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
