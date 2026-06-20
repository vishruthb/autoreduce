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
        Describe what you want to optimize — in plain language, as vague or as
        specific as you like. The planner derives a metric and drives the pool.
      </p>
      <div className="mt-lg flex flex-col gap-sm">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              run();
            }
          }}
          rows={Math.min(10, Math.max(2, prompt.split("\n").length))}
          placeholder="e.g. make the data-loading pipeline as fast as possible without changing its outputs…"
          className="w-full resize-y rounded-lg border border-hairline bg-canvas px-lg py-md text-body-md text-ink outline-none focus:border-ink"
        />
        <div className="flex items-center justify-between">
          <span className="text-caption-sm text-mute">
            Enter to run · Shift+Enter for a new line
          </span>
          <Pill onClick={run} disabled={busy || !prompt.trim()}>
            {busy ? "Starting…" : "Run"}
          </Pill>
        </div>
      </div>
      {error && <p className="mt-md text-body-sm text-ink">⚠ {error}</p>}
    </section>
  );
}
