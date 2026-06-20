import type { Idea, Slot } from "@/lib/api";
import { AgentBox } from "./AgentBox";

/** The core visual: the bounded pool of 8, keyed by gpu_id so boxes never
 *  remount as slots fill and empty. */
export function AgentPool({
  slots,
  ideasById,
  logs,
  now,
}: {
  slots: Slot[];
  ideasById: Map<number, Idea>;
  logs: Map<number, string[]>;
  now: number;
}) {
  return (
    <div className="grid grid-cols-2 items-start gap-md sm:grid-cols-4 xl:grid-cols-8">
      {slots.map((slot) => (
        <AgentBox
          key={slot.gpu_id}
          slot={slot}
          idea={slot.idea_id != null ? ideasById.get(slot.idea_id) : undefined}
          logs={slot.idea_id != null ? logs.get(slot.idea_id) ?? [] : []}
          now={now}
        />
      ))}
    </div>
  );
}
