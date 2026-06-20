"""Planner loop — the only place the LLM drives the system.

One asyncio task. It picks up a pending run (which already targets a sealed
task), seeds a first batch of research **ideas** (hypotheses for methods
implementing the task's interface), then keeps the queue full by reseeding —
exploiting the best verified methods, exploring new directions, and promoting
worker follow-ups — until the budget halts the run. It only ever *proposes*; the
budget gate and run-state transitions live in the store.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from . import bench, db, events, llm, runs, store
from .config import settings

PLAN_INTERVAL = 1.0

# instrumentation only (gated by settings.planner_log); does not affect proposals
_batch = 0


def _log_proposal(*, batch: int, kind: str, run, digest: dict[str, Any],
                  ideas: list[dict[str, Any]]) -> None:
    if not settings.planner_log:
        return
    try:
        entry = {
            "ts": time.time(),
            "batch": batch,
            "kind": kind,                       # "seed" | "reseed"
            "run_id": run["id"],
            "prompt": run["prompt"],
            "digest_in": digest,                # top_ideas / tried_hypotheses / followups / queue_depth
            "hypotheses_out": [
                {"text": i.get("hypothesis"), "origin": i.get("origin")} for i in ideas
            ],
        }
        with open(settings.planner_log, "a") as fh:
            fh.write(json.dumps(entry) + "\n")
    except OSError:
        pass


async def planner_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await _tick()
        except Exception:  # noqa: BLE001 — never let the planner die
            pass
        try:
            await asyncio.wait_for(stop.wait(), timeout=PLAN_INTERVAL)
        except asyncio.TimeoutError:
            pass


async def _db(fn):
    async with db.STATE_LOCK:
        return fn(db.conn())


async def _tick() -> None:
    run = await _db(store.active_run)
    if run is None:
        pending = await _db(store.next_pending_run)
        if pending is not None:
            await _start_run(pending)
        return
    if run["state"] != "running":
        return  # draining/done — nothing to propose
    digest = await _db(lambda c: store.read_digest(c, run["id"]))
    if digest["queue_depth"] < 2 * settings.pool_size:
        await _reseed(run, digest)


async def _set_planner(run_id: int, **kw) -> None:
    await _db(lambda c: store.set_planner_status(c, run_id, **kw))
    events.broker.publish_snapshot()


def _empty_digest() -> dict[str, Any]:
    return {"top_ideas": [], "tried_hypotheses": [], "followups": [], "queue_depth": 0}


async def _propose(task, digest, n: int, *, seed: bool) -> list[dict[str, Any]]:
    ideas = await llm.propose_hypotheses(
        n=n, domain_blurb=task.domain_blurb,
        interface_source=task.interface_source(),
        interface_name=task.interface_name,
        objective_name=task.objective_name, direction=task.direction,
        digest=digest)
    if seed:
        for idea in ideas:
            idea["origin"] = "seed"
    return ideas


async def _insert(run_id: int, ideas: list[dict[str, Any]]) -> int:
    inserted, _ = await _db(
        lambda c: runs.insert_hypotheses(c, run_id=run_id, hypotheses=ideas))
    if inserted:
        events.broker.publish_snapshot()
    return inserted


async def _start_run(pending) -> None:
    run_id = pending["id"]
    try:
        task = bench.load_task(pending["task_id"])
    except Exception as exc:  # noqa: BLE001 — unknown/unloadable task
        await _db(lambda c: store.set_run_state(c, run_id, "failed", error=str(exc)))
        await _set_planner(run_id, status="done")
        return
    try:
        await _db(lambda c: store.set_run_state(c, run_id, "running"))
        await _set_planner(run_id, status="seeding",
                           reasoning=f"Seeding ideas for: {task.domain_blurb[:80]}…",
                           exploring_region=task.objective_name)
        ideas = await _propose(task, _empty_digest(), 2 * settings.pool_size, seed=True)
        global _batch
        _batch = 0
        _log_proposal(batch=0, kind="seed", run=pending, digest=_empty_digest(), ideas=ideas)
        if await _insert(run_id, ideas) == 0:
            await _db(lambda c: store.set_run_state(
                c, run_id, "failed", error="planner produced no valid seed ideas"))
            await _set_planner(run_id, status="done")
            return
        await _set_planner(run_id, status="waiting",
                           reasoning="Agents are implementing and measuring the seed batch.")
    except llm.LLMError as exc:
        await _db(lambda c: store.set_run_state(c, run_id, "failed", error=str(exc)))
        await _set_planner(run_id, status="done")


async def _reseed(run, digest) -> None:
    run_id = run["id"]
    n = 3 * settings.pool_size - digest["queue_depth"]
    if n <= 0:
        return
    try:
        task = bench.load_task(run["task_id"])
    except Exception:  # noqa: BLE001
        return
    await _set_planner(run_id, status="thinking",
                       reasoning="Reprioritizing: exploiting the best methods and "
                                 "exploring new directions.",
                       exploring_region=_describe(digest))
    try:
        ideas = await _propose(task, digest, n, seed=False)
    except llm.LLMError:
        return  # transient; try again next tick
    global _batch
    _batch += 1
    _log_proposal(batch=_batch, kind="reseed", run=run, digest=digest, ideas=ideas)
    await _insert(run_id, ideas)
    await _set_planner(run_id, status="waiting")


def _describe(digest: dict[str, Any]) -> str:
    top = digest.get("top_ideas") or []
    followups = digest.get("followups") or []
    if followups:
        return f"following up on {len(followups)} worker suggestion(s)"
    if top:
        best = top[0]
        return f"best so far {best.get('metric')}× — refining around it"
    return "exploring broadly"
