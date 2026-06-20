"use client";

import { useState } from "react";
import { startRun } from "@/lib/api";
import { Pill } from "@/components/ui/Pill";

export function RunControls() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    const res = await startRun({ prompt });
    setBusy(false);
    if (!res.ok) {
      setError(res.detail ?? "could not start run");
      return;
    }
    setPrompt("");
  }

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-xl">
      <h2 className="text-heading-sm text-ink">Start a run</h2>
      <p className="mt-xs text-body-sm text-body">
        Describe a numeric objective. The planner derives the search space and
        drives the pool.
      </p>
      <div className="mt-lg flex flex-col gap-sm sm:flex-row sm:items-center">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="e.g. maximize throughput of a batched inference server…"
          className="h-input flex-1 rounded-full border border-hairline bg-canvas px-lg text-body-md text-ink outline-none focus:border-ink"
        />
        <Pill onClick={run} disabled={busy || !prompt.trim()}>
          {busy ? "Starting…" : "Run"}
        </Pill>
      </div>
      {error && <p className="mt-md text-body-sm text-ink">⚠ {error}</p>}
    </section>
  );
}
