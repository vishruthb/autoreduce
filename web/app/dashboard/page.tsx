"use client";

import { useEffect, useMemo } from "react";
import { cancelRun, resetAll, type Idea } from "@/lib/api";
import { useEventStream, useNow } from "@/lib/useEventStream";
import { useConnection } from "@/lib/connection";
import { PlannerBox } from "@/components/dashboard/PlannerBox";
import { AgentPool } from "@/components/dashboard/AgentPool";
import { RankedTable } from "@/components/dashboard/RankedTable";
import { RunControls } from "@/components/dashboard/RunControls";
import { ReportPanel } from "@/components/dashboard/ReportPanel";

export default function DashboardPage() {
  const { snapshot, logs, connection } = useEventStream();
  const now = useNow();

  // publish connection up to the nav (TopBar) and clear it on unmount
  const { setConnection } = useConnection();
  useEffect(() => {
    setConnection(connection);
  }, [connection, setConnection]);
  useEffect(() => () => setConnection(null), [setConnection]);

  const ideasById = useMemo(() => {
    const m = new Map<number, Idea>();
    snapshot?.ideas.forEach((i) => m.set(i.id, i));
    return m;
  }, [snapshot]);

  const run = snapshot?.run ?? null;
  const planner = snapshot?.planner ?? null;
  const active = run != null && (run.state === "running" || run.state === "draining");
  const showControls = !active;
  const showReport =
    run != null && (run.state === "done" || run.state === "draining");
  const busy = snapshot?.slots.filter((s) => s.status === "busy").length ?? 0;

  return (
    <main className="mx-auto max-w-dash px-lg py-xl">
      {!snapshot ? (
        <p className="mt-section text-center text-body-sm text-mute">loading…</p>
      ) : (
        <div className="space-y-xl">
          {run && (
            <div className="flex items-center justify-end gap-lg">
              {active ? (
                <button
                  onClick={() => cancelRun(run.id)}
                  className="text-caption-sm text-body underline hover:text-ink"
                >
                  cancel run
                </button>
              ) : (
                <button
                  onClick={() => resetAll()}
                  className="text-caption-sm text-ink underline"
                >
                  new run
                </button>
              )}
            </div>
          )}

          {planner && run && active && <PlannerBox planner={planner} run={run} />}

          {showReport && run && (
            <ReportPanel run={run} refreshKey={snapshot.stats.done} />
          )}

          {showControls && <RunControls />}

          {active && (
            <section>
              <div className="mb-md flex items-baseline justify-between">
                <h2 className="text-heading-sm text-ink">Agent pool</h2>
                <span className="text-caption-sm text-mute">
                  {busy} running · {snapshot.slots.length - busy} idle
                </span>
              </div>
              <AgentPool
                slots={snapshot.slots}
                ideasById={ideasById}
                logs={logs}
                now={now}
              />
            </section>
          )}

          {run && (
            <section>
              <div className="mb-md flex items-baseline justify-between">
                <h2 className="text-heading-sm text-ink">Ranked results</h2>
                <span className="text-caption-sm text-mute">
                  {snapshot.stats.done} done · {snapshot.stats.running} running ·{" "}
                  {snapshot.stats.queued} queued
                  {snapshot.stats.failed > 0 && ` · ${snapshot.stats.failed} failed`}
                </span>
              </div>
              <RankedTable ideas={snapshot.ideas} now={now} />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
