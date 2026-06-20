"use client";

import { Card } from "@/components/ui/Card";

interface ScaleCurve {
  idea_id: number;
  hypothesis: string;
  points: Array<Record<string, unknown>>;
}

export function ScaleCurves({ curves }: { curves?: ScaleCurve[] }) {
  const visible = (curves ?? []).filter((curve) => curve.points.length > 1);
  if (visible.length === 0) return null;

  return (
    <section>
      <div className="mb-md flex items-baseline justify-between">
        <h2 className="text-heading-sm text-ink">Scale curves</h2>
        <span className="text-caption-sm text-mute">
          {visible.length} idea{visible.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid gap-md lg:grid-cols-2">
        {visible.map((curve) => (
          <Card key={curve.idea_id} className="p-lg">
            <div className="line-clamp-2 text-body-sm text-charcoal">
              {curve.hypothesis || `Idea ${curve.idea_id}`}
            </div>
            <div className="mt-sm text-caption-sm text-mute">
              {decisionLabel(curve.points)}
            </div>
            <div className="mt-md flex flex-wrap gap-sm">
              {curve.points.map((point, index) => (
                <div
                  key={`${curve.idea_id}-${index}`}
                  className="rounded-md border border-hairline bg-surface-soft px-md py-sm"
                >
                  <div className="font-mono text-code-sm text-ink">
                    {String(point.gpu_count ?? 1)} GPU
                  </div>
                  <div className="mt-xs font-mono text-code-sm text-charcoal">
                    {formatMetric(point.metric)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function formatMetric(value: unknown) {
  return typeof value === "number" ? `${value.toFixed(3)}x` : "-";
}

function decisionLabel(points: Array<Record<string, unknown>>) {
  const sorted = [...points]
    .map((point) => ({
      gpu: Number(point.gpu_count ?? 1),
      metric: typeof point.metric === "number" ? point.metric : null,
    }))
    .filter((point) => point.metric != null)
    .sort((a, b) => a.gpu - b.gpu);
  if (sorted.length < 2) return "waiting for another scale point";
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const gain = ((last.metric! - prev.metric!) / Math.max(Math.abs(prev.metric!), 1)) * 100;
  if (gain > 8) return `still scaling: +${gain.toFixed(1)}% at ${last.gpu} GPU`;
  if (gain > 2) return `modest scaling: +${gain.toFixed(1)}% at ${last.gpu} GPU`;
  return `flattening: +${Math.max(0, gain).toFixed(1)}% at ${last.gpu} GPU`;
}
