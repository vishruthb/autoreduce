import { API_BASE } from "./env";

// --- types mirroring the backend snapshot ---------------------------------

export type RunState = "pending" | "running" | "draining" | "done" | "failed";
export type PlannerStatus =
  | "idle"
  | "designing"
  | "seeding"
  | "thinking"
  | "waiting"
  | "done";
export type IdeaStatus = "queued" | "running" | "done" | "failed";
export type Origin = "seed" | "exploit" | "explore";
export type SlotStatus = "free" | "busy";
export type Direction = "maximize" | "minimize";

export interface Run {
  id: number;
  prompt: string;
  state: RunState;
  objective_name: string | null;
  direction: Direction;
  budget_total: number;
  budget_spent: number;
  model: string | null;
  error: string | null;
}

export interface Planner {
  status: PlannerStatus;
  objective_name: string | null;
  direction: Direction;
  budget_total: number;
  budget_spent: number;
  latest_reasoning: string | null;
  exploring_region: string | null;
}

export interface Slot {
  gpu_id: number;
  status: SlotStatus;
  idea_id: number | null;
  agent: string | null;
  claimed_at: number | null;
}

export interface Idea {
  id: number;
  config: Record<string, unknown>;
  status: IdeaStatus;
  origin: Origin;
  metric_value: number | null;
  baseline: number | null;
  rationale: string | null;
  method_diff: string | null;
  followup: string | null;
  error: string | null;
  gpu_id: number | null;
  agent: string | null;
  rank: number | null;
  created_at: number;
  claimed_at: number | null;
  finished_at: number | null;
}

export interface Stats {
  total: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  best_value: number | null;
  best_idea_id: number | null;
}

export interface StateSnapshot {
  run: Run | null;
  planner: Planner | null;
  slots: Slot[];
  ideas: Idea[];
  stats: Stats;
  server_time: number;
}

export interface SnapshotEvent {
  type: "snapshot";
  seq: number;
  data: StateSnapshot;
}

export interface LogAppendEvent {
  type: "log_append";
  seq: number;
  idea_id: number;
  gpu_id: number;
  agent: string | null;
  lines: string[];
}

export interface Preset {
  name: string;
  prompt: string;
  objective_name: string;
  direction: Direction;
  budget_total: number;
  idea_schema: Record<string, unknown>;
}

export interface StartRunBody {
  prompt: string;
  budget_total?: number;
  direction?: Direction;
  objective_name?: string;
  idea_schema?: Record<string, unknown>;
}

// --- fetch helpers ---------------------------------------------------------

export const eventsUrl = (): string => `${API_BASE}/events`;

export async function getState(): Promise<SnapshotEvent> {
  const r = await fetch(`${API_BASE}/state`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /state ${r.status}`);
  return r.json();
}

export async function getPreset(name: string): Promise<Preset> {
  const r = await fetch(`${API_BASE}/presets/${name}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /presets/${name} ${r.status}`);
  return r.json();
}

export async function startRun(
  body: StartRunBody
): Promise<{ run_id?: number; detail?: string; ok: boolean }> {
  const r = await fetch(`${API_BASE}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { ...json, ok: r.ok };
}

export async function cancelRun(runId: number): Promise<void> {
  await fetch(`${API_BASE}/runs/${runId}/cancel`, { method: "POST" });
}

// --- report ----------------------------------------------------------------

export interface Finding {
  id: number;
  hypothesis: string;
  origin: Origin;
  status: IdeaStatus;
  rationale: string | null;
  metric: number | null;
  baseline: number | null;
  method_diff: string | null;
  followup: string | null;
  error: string | null;
  duration_s: number | null;
  rank: number | null;
}

export interface Report {
  run: {
    id: number;
    prompt: string;
    objective_name: string | null;
    direction: Direction;
    state: RunState;
    model: string | null;
    task_id: string;
    budget_total: number;
    budget_spent: number;
    error: string | null;
    created_at: number;
  };
  summary: {
    total: number;
    done: number;
    failed: number;
    running: number;
    queued: number;
    best_metric: number | null;
    best_idea_id: number | null;
    baseline: number | null;
  };
  findings: Finding[];
  followups: string[];
}

export const reportMarkdownUrl = (runId: number): string =>
  `${API_BASE}/runs/${runId}/report.md`;

export async function getReport(runId: number): Promise<Report> {
  const r = await fetch(`${API_BASE}/runs/${runId}/report`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /runs/${runId}/report ${r.status}`);
  return r.json();
}

export async function resetAll(): Promise<void> {
  await fetch(`${API_BASE}/reset`, { method: "POST" });
}
