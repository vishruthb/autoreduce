"use client";

import { useState } from "react";
import type { Idea, Slot } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { AgentLog } from "./AgentLog";
import { OriginTag } from "./OriginTag";
import { elapsedClock, summarizeConfig } from "@/lib/format";

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
      <Card className="flex min-h-[96px] flex-col p-lg">
        <div className="flex items-center justify-between">
          <span className="font-mono text-code-sm text-mute">
            GPU {slot.gpu_id}
          </span>
          <StatusDot kind="free" />
        </div>
        <div className="flex flex-1 items-center justify-center text-body-sm text-mute">
          idle
        </div>
      </Card>
    );
  }

  return (
    <Card className="min-h-[96px] p-lg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
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

      <div className="mt-sm truncate font-mono text-code-sm text-charcoal">
        {summarizeConfig(idea!.config)}
      </div>
      <div className="mt-sm flex items-center gap-sm">
        <OriginTag origin={idea!.origin} />
        <span className="text-mute">{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div className="mt-md space-y-md">
          <pre className="overflow-auto rounded-md bg-surface-soft p-md font-mono text-code-sm text-ink">
            {JSON.stringify(idea!.config, null, 2)}
          </pre>
          {idea!.rationale && (
            <p className="text-body-sm text-body">{idea!.rationale}</p>
          )}
          <AgentLog lines={logs} />
        </div>
      )}
    </Card>
  );
}
