"use client";

import { useState } from "react";
import type { Idea, Slot } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { AgentLog } from "./AgentLog";
import { OriginTag } from "./OriginTag";
import { elapsedClock, hypothesisOf } from "@/lib/format";

export function AgentBox({
  slot,
  idea,
  logs,
  now,
}: {
  slot: Slot;
  idea: Idea | undefined;
  logs: string[];
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const busy = slot.status === "busy" && idea != null;

  if (!busy) {
    return (
      <Card className="flex items-center justify-between p-md opacity-70">
        <span className="font-mono text-code-sm text-mute">GPU {slot.gpu_id}</span>
        <span className="flex items-center gap-sm text-body-sm text-mute">
          idle
          <StatusDot kind="free" />
        </span>
      </Card>
    );
  }

  const hypothesis = hypothesisOf(idea!.config);

  return (
    <Card className="min-h-[96px] p-lg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        title={open ? "collapse" : "expand to see what this worker is doing"}
      >
        <span className="flex items-center gap-sm">
          <span className="font-mono text-code-sm text-ink">GPU {slot.gpu_id}</span>
          <StatusDot kind="running" />
          <span className="text-body-sm text-mute">{slot.agent}</span>
        </span>
        <span className="font-mono text-code-sm text-ink">
          {elapsedClock(slot.claimed_at, now)}
        </span>
      </button>

      {/* the hypothesis this worker is implementing */}
      <div
        className={`mt-sm text-body-sm text-charcoal ${open ? "" : "line-clamp-2"}`}
      >
        {hypothesis}
      </div>
      <div className="mt-sm flex items-center gap-sm">
        <OriginTag origin={idea!.origin} />
        <span className="text-caption-sm text-mute">
          {open ? "▾ hide work" : "▸ show work"}
        </span>
      </div>

      {open && (
        <div className="mt-md space-y-md">
          {idea!.rationale && (
            <p className="text-body-sm text-body">
              <span className="text-mute">why: </span>
              {idea!.rationale}
            </p>
          )}
          <AgentLog lines={logs} />
        </div>
      )}
    </Card>
  );
}
