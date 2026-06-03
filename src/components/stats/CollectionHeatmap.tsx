import type { StoredSticker } from '@/types/collection';

interface CollectionHeatmapProps {
  stickers: StoredSticker[];
  inventory: Map<string, number>;
}

function cellColor(quantity: number): string {
  if (quantity === 0) return 'bg-slate-200 dark:bg-slate-800';
  if (quantity === 1) return 'bg-emerald-400';
  if (quantity === 2) return 'bg-amber-400';
  return 'bg-red-400';
}

/**
 * A compact ownership heatmap: one tiny cell per sticker, colored by how many
 * copies are owned. Gives an at-a-glance picture of collection density.
 */
export function CollectionHeatmap({
  stickers,
  inventory,
}: CollectionHeatmapProps) {
  return (
    <div
      className="flex flex-wrap gap-1"
      data-testid="heatmap"
      role="img"
      aria-label="Collection ownership heatmap"
    >
      {stickers.map((sticker) => {
        const qty = inventory.get(sticker.id) ?? 0;
        return (
          <span
            key={sticker.uid}
            title={`${sticker.code} · ${qty}`}
            className={`h-3 w-3 rounded-sm ${cellColor(qty)}`}
          />
        );
      })}
    </div>
  );
}
