/** Budget progress on the dark planner surface. White-on-dark fill reads as the
 *  accent without introducing a color; the only motion is a 300ms width slide. */
export function BudgetBar({ spent, total }: { spent: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  return (
    <div className="flex items-center gap-md">
      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-on-dark transition-[width] duration-300 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-code-sm text-on-dark-mute">
        {spent} / {total}
      </span>
    </div>
  );
}
