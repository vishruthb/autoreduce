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

# Relative gain that counts as "the frontier moved"; below it the best is treated
# as unchanged so noise-level improvements don't mask a plateau.
_IMPROVE_EPS = 0.005

# Reseed counter + the best metric seen and the batch that set it. These let the
# planner measure how many batches the frontier has stalled. Reset per run.
_batch = 0
_best_metric: float | None = None
_best_batch = 0


def _improved(best: float | None, prev: float | None, direction: str) -> bool:
    """Did `best` beat `prev` by more than the noise epsilon?"""
    if best is None:
        return False
    if prev is None:
        return True
    if direction == "maximize":
        return best > prev * (1 + _IMPROVE_EPS)
    return best < prev * (1 - _IMPROVE_EPS)


def _explore_target(n: int, stall: int) -> int:
    """How many of n proposals must be explore — escalates as the frontier stalls."""
    if n <= 0:
        return 0
    if stall >= 2:
        return min(n, max(2, round(0.75 * n)))   # plateau: majority explore
    if stall == 1:
        return max(1, round(0.5 * n))
    return max(1, round(0.25 * n))                # frontier moving: mostly exploit


def _trim_followups(followups: list[str], stall: int) -> list[str]:
    """Worker followups are overwhelmingly winner-refinements; mute them on a
    plateau so the one novelty channel stops dragging every batch into the
    winner's basin."""
    if stall >= 2:
        return []
    if stall == 1:
        return followups[:2]
    return followups


def _log_proposal(*, batch: int, kind: str, run, digest: dict[str, Any],
                  ideas: list[dict[str, Any]],
                  policy: dict[str, Any] | None = None) -> None:
    if not settings.planner_log:
        return
    try:
        entry = {
            "ts": time.time(),
            "batch": batch,
            "kind": kind,                       # "seed" | "reseed"
            "run_id": run["id"],
            "prompt": run["prompt"],
            "policy": policy,                   # stall / explore_target / n / best_metric
            "digest_in": digest,                # best_metric / trajectory / top_ideas / tried / followups
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
    return {"best_metric": None, "best_trajectory": [], "top_ideas": [],
            "tried_hypotheses": [], "followups": [], "queue_depth": 0}


async def _propose(task, digest, n: int, *, seed: bool, stall_batches: int = 0,
                   explore_target: int | None = None) -> list[dict[str, Any]]:
    ideas = await llm.propose_hypotheses(
        n=n, domain_blurb=task.domain_blurb,
        interface_source=task.interface_source(),
        interface_name=task.interface_name,
        objective_name=task.objective_name, direction=task.direction,
        digest=digest, stall_batches=stall_batches, explore_target=explore_target)
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
        global _batch, _best_metric, _best_batch
        _batch = 0
        _best_metric = None
        _best_batch = 0
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

    # Measure the stall: how many batches since the frontier last moved (epsilon'd
    # so noise-level gains don't reset it). This drives the explore escalation.
    global _batch, _best_metric, _best_batch
    _batch += 1
    best = digest.get("best_metric")
    if _improved(best, _best_metric, run["direction"]):
        _best_metric = best
        _best_batch = _batch
    stall = (_batch - _best_batch) if _best_metric is not None else 0
    explore_target = _explore_target(n, stall)

    # Work on a copy so we never mutate the store's read model; inject the stall
    # signal and mute exploit-flavoured followups when plateaued.
    digest = dict(digest)
    digest["batch"] = _batch
    digest["batches_since_best_improved"] = stall
    digest["followups"] = _trim_followups(digest.get("followups") or [], stall)

    await _set_planner(run_id, status="thinking",
                       reasoning=_reseed_reason(stall, best),
                       exploring_region=_describe(digest))
    try:
        ideas = await _propose(task, digest, n, seed=False,
                               stall_batches=stall, explore_target=explore_target)
    except llm.LLMError:
        return  # transient; try again next tick
    _log_proposal(batch=_batch, kind="reseed", run=run, digest=digest, ideas=ideas,
                  policy={"stall": stall, "explore_target": explore_target,
                          "n": n, "best_metric": best})
    await _insert(run_id, ideas)
    await _set_planner(run_id, status="waiting")


def _reseed_reason(stall: int, best: float | None) -> str:
    if stall >= 2:
        return (f"Frontier flat {stall} batches at {best}× — escalating exploration "
                "toward structurally different methods.")
    if best is not None:
        return f"Best so far {best}× — refining winners and exploring new directions."
    return "Reprioritizing: exploiting the best methods and exploring new directions."


def _describe(digest: dict[str, Any]) -> str:
    top = digest.get("top_ideas") or []
    followups = digest.get("followups") or []
    if followups:
        return f"following up on {len(followups)} worker suggestion(s)"
    if top:
        best = top[0]
        return f"best so far {best.get('metric')}× — refining around it"
    return "exploring broadly"
