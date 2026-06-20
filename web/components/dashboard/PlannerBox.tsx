"use client";

import { useState } from "react";
import type { Planner, Run } from "@/lib/api";
import { StatusDot } from "@/components/ui/StatusDot";
import { BudgetBar } from "./BudgetBar";

const ACTIVE = new Set(["designing", "seeding", "thinking"]);

export function PlannerBox({ planner, run }: { planner: Planner; run: Run }) {
  const [expanded, setExpanded] = useState(false);
  const arrow = planner.direction === "minimize" ? "↓" : "↑";
  const objective = planner.objective_name ?? "objective";
  const dotKind = ACTIVE.has(planner.status) ? "thinking" : "idle";

  return (
    <section className="rounded-lg bg-surface-dark p-xxl text-on-dark">
      <div className="flex items-start justify-between gap-lg">
        <div className="text-body-sm-strong uppercase tracking-wide text-on-dark-mute">
          {planner.direction} {arrow} {objective}
        </div>
        <span className="inline-flex items-center gap-sm rounded-full bg-white/10 px-md py-xxs text-button-md text-on-dark">
          <StatusDot kind={dotKind} onDark />
          {planner.status}
        </span>
      </div>

      <h2 className="mt-md line-clamp-2 text-heading-md text-on-dark">
        {run.prompt}
      </h2>

      <div className="mt-xl">
        <BudgetBar spent={planner.budget_spent} total={planner.budget_total} />
      </div>

      {planner.exploring_region && (
        <div className="mt-lg">
          <span className="rounded-full bg-white/10 px-md py-xs font-mono text-code-sm text-on-dark">
            {planner.exploring_region}
          </span>
        </div>
      )}

      {planner.latest_reasoning && (
        <div className="mt-lg">
          <p
            className={`text-body-md text-on-dark-mute ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {planner.latest_reasoning}
          </p>
          {planner.latest_reasoning.length > 160 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-xs text-body-sm text-on-dark underline"
            >
              {expanded ? "show less" : "show more"}
            </button>
          )}
        </div>
      )}

      {run.error && (
        <p className="mt-lg text-body-sm text-on-dark">⚠ {run.error}</p>
      )}
    </section>
  );
}
