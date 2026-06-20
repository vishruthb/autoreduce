"""HTTP API: worker-facing tool endpoints + the read API the UI consumes.

All mutating endpoints are ``async def`` so they run on the single event-loop
thread (never FastAPI's hidden ``def``-handler threadpool) — this is what keeps
the SQLite write path single-threaded and the atomic claim airtight.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel

from . import bench, db, events, report, store
from .config import settings

router = APIRouter()


# --- request bodies --------------------------------------------------------

class ClaimBody(BaseModel):
    agent_id: int


class ReportBody(BaseModel):
    idea_id: int
    metric: float | None = None        # system-sealed metric (from the benchmark)
    status: str
    error: str | None = None
    gpu_id: int | None = None
    agent_id: int | None = None
    method_diff: str | None = None     # short description of what the agent built
    followup: str | None = None        # optional next idea the agent suggests
    baseline: float | None = None


class HeartbeatBody(BaseModel):
    gpu_id: int
    idea_id: int


class AgentLogBody(BaseModel):
    idea_id: int
    gpu_id: int
    agent_id: int | None = None
    line: str


class RunBody(BaseModel):
    prompt: str
    budget_total: int | None = None
    task: str | None = None     # which sealed task; defaults to settings.default_task


def _summary(config: dict[str, Any]) -> str:
    parts = [f"{k}={config[k]}" for k in sorted(config)]
    return " ".join(parts)[:160]


# --- worker-facing tool endpoints ------------------------------------------

@router.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True}


@router.post("/claim_idea")
async def claim_idea(body: ClaimBody) -> dict[str, Any]:
    result = await store.claim_idea(body.agent_id)
    if result.get("status") == "ok":
        cfg = result["idea"]["config"]
        label = cfg.get("hypothesis") or _summary(cfg)
        events.broker.publish_log(
            idea_id=result["idea"]["id"], gpu_id=result["gpu_id"],
            agent=f"worker-{body.agent_id}",
            lines=[f"💡 gpu{result['gpu_id']}: {label}"])
        events.broker.publish_snapshot()
    return result


@router.post("/report_result")
async def report_result(body: ReportBody) -> dict[str, Any]:
    result = await store.report_result(
        body.idea_id, body.metric, body.status, body.error,
        method_diff=body.method_diff, followup=body.followup, baseline=body.baseline)
    if result.get("accepted") and body.gpu_id is not None:
        if body.status == "done":
            line = f"✓ {body.metric}× — {body.method_diff or 'method'}"
        else:
            line = f"✗ {body.error or 'failed'}"
        events.broker.publish_log(
            idea_id=body.idea_id, gpu_id=body.gpu_id,
            agent=f"worker-{body.agent_id}" if body.agent_id is not None else None,
            lines=[line])
    events.broker.publish_snapshot()
    return result


@router.post("/heartbeat")
async def heartbeat(body: HeartbeatBody) -> dict[str, Any]:
    return await store.heartbeat(body.gpu_id, body.idea_id)


@router.post("/agent_log")
async def agent_log(body: AgentLogBody) -> dict[str, Any]:
    events.broker.publish_log(
        idea_id=body.idea_id, gpu_id=body.gpu_id,
        agent=f"worker-{body.agent_id}" if body.agent_id is not None else None,
        lines=[body.line])
    return {"ok": True}


@router.get("/read_digest")
async def read_digest() -> dict[str, Any]:
    async with db.STATE_LOCK:
        run = store.active_run(db.conn())
        if run is None:
            return {"best_metric": None, "best_trajectory": [], "top_ideas": [],
                    "tried_hypotheses": [], "followups": [], "queue_depth": 0}
        return store.read_digest(db.conn(), run["id"])


# --- read API (UI) ---------------------------------------------------------

@router.get("/state")
async def state() -> dict[str, Any]:
    return events.broker.current_snapshot()


@router.get("/events")
async def events_stream() -> StreamingResponse:
    async def gen():
        q = events.broker.subscribe()
        try:
            while True:
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield events.format_sse(evt)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            events.broker.unsubscribe(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/runs")
async def create_run(body: RunBody) -> dict[str, Any]:
    async with db.STATE_LOCK:
        conn = db.conn()
        existing = conn.execute(
            "SELECT id FROM runs WHERE state IN ('pending','running','draining') "
            "LIMIT 1"
        ).fetchone()
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="a run is already active; cancel it before starting another")
        # the run targets a sealed task loaded from the external tasks dir; its
        # objective + direction come from the task, not the user — the prompt is
        # framing for hypothesis generation.
        try:
            task_name = bench.resolve_default(body.task)
            task = bench.load_task(task_name)
        except Exception as exc:  # noqa: BLE001 — unknown/unloadable task
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        run_id = store.create_run(
            conn,
            prompt=body.prompt,
            budget_total=body.budget_total or settings.default_budget,
            seed=settings.seed,
            direction=task.direction,
            objective_name=task.objective_name,
            model=settings.model,
            task_id=task_name,
        )
    events.broker.publish_snapshot()
    return {"run_id": run_id}


async def _resolve_report(run_id: int | None) -> dict[str, Any]:
    async with db.STATE_LOCK:
        conn = db.conn()
        if run_id is None:
            run = store.latest_run(conn)
            if run is None:
                raise HTTPException(status_code=404, detail="no runs yet")
            run_id = run["id"]
        try:
            return report.build_report(conn, run_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/report")
async def latest_report() -> dict[str, Any]:
    return await _resolve_report(None)


@router.get("/report.md", response_class=PlainTextResponse)
async def latest_report_md() -> str:
    return report.render_markdown(await _resolve_report(None))


@router.get("/runs/{run_id}/report")
async def run_report(run_id: int) -> dict[str, Any]:
    return await _resolve_report(run_id)


@router.get("/runs/{run_id}/report.md", response_class=PlainTextResponse)
async def run_report_md(run_id: int) -> str:
    return report.render_markdown(await _resolve_report(run_id))


@router.post("/reset")
async def reset() -> dict[str, Any]:
    """Clear all runs + ideas (and free slots) so a fresh run starts clean."""
    await store.reset_all()
    events.broker.publish_snapshot()
    return {"ok": True}


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: int) -> dict[str, Any]:
    async with db.STATE_LOCK:
        conn = db.conn()
        run = store.get_run(conn, run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="no such run")
        if run["state"] in ("pending", "running", "draining"):
            store.set_run_state(conn, run_id, "done")
            store.set_planner_status(conn, run_id, status="done")
    events.broker.publish_snapshot()
    return {"status": "cancelled"}
