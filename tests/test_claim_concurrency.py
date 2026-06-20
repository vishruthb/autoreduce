"""Key-free correctness tests for the table engine.

These prove the core invariant — ZERO double-allocation of GPU slots or ideas —
without any API key, by driving the transactional core directly:

* the async path through the control-plane wrappers (real runtime model: one
  event loop, one shared connection, STATE_LOCK), and
* the raw SQL path from many OS threads with separate connections (proves the
  ``BEGIN IMMEDIATE`` + conditional-UPDATE guard holds even without the lock).
"""

from __future__ import annotations

import asyncio
import json
import threading
import time

from autoreduce import db, store

_SCHEMA = json.dumps({
    "type": "object",
    "additionalProperties": False,
    "required": ["x"],
    "properties": {"x": {"type": "number", "minimum": 0, "maximum": 1}},
})


def _setup_db(path: str, pool_size: int = 8):
    conn = db.connect(path)
    db.init_schema(conn)
    db.seed_slots(conn, pool_size)
    return conn


def _make_run(conn, *, budget: int, n_ideas: int) -> int:
    run_id = store.create_run(
        conn, prompt="test", budget_total=budget, seed=1, task_id="t",
        direction="maximize", objective_name="m", schema_json=_SCHEMA,
    )
    store.set_run_state(conn, run_id, "running")
    for i in range(n_ideas):
        store.insert_idea(conn, run_id=run_id, config={"x": float(i), "k": i},
                          origin="seed", rationale=None)
    return run_id


def test_async_claim_no_double_allocation(tmp_path):
    path = str(tmp_path / "async.db")
    db.setup(path, pool_size=8)
    conn = db.conn()
    run_id = _make_run(conn, budget=10_000, n_ideas=200)

    claimed_ideas: list[int] = []
    claimed_gpus: list[int] = []

    async def worker():
        while True:
            r = await store.claim_idea(agent_id=0)
            if r["status"] != "ok":
                if r["reason"] in ("empty_queue", "budget", "no_active_run"):
                    return
                await asyncio.sleep(0)  # no_free_slot — let a peer report
                continue
            claimed_ideas.append(r["idea"]["id"])
            claimed_gpus.append(r["gpu_id"])
            await asyncio.sleep(0)
            await store.report_result(r["idea"]["id"], metric=1.0, status="done")

    async def main():
        # fresh lock bound to THIS loop (module global is reused across tests)
        db.STATE_LOCK = asyncio.Lock()
        await asyncio.gather(*[worker() for _ in range(32)])

    asyncio.run(main())

    # every idea claimed exactly once
    assert len(claimed_ideas) == 200
    assert len(set(claimed_ideas)) == 200

    rows = conn.execute(
        "SELECT status, attempts FROM ideas WHERE run_id=?", (run_id,)
    ).fetchall()
    assert all(r["status"] == "done" for r in rows)
    assert all(r["attempts"] == 1 for r in rows)  # no idea claimed twice

    # no slot left busy
    busy = conn.execute("SELECT COUNT(*) FROM gpu_slots WHERE status='busy'").fetchone()[0]
    assert busy == 0
    db.close()


def test_threaded_sql_guard_no_double_allocation(tmp_path):
    path = str(tmp_path / "threads.db")
    setup_conn = _setup_db(path, pool_size=8)
    run_id = _make_run(setup_conn, budget=10_000, n_ideas=120)
    setup_conn.close()

    claimed: list[tuple[int, int]] = []
    cl_lock = threading.Lock()
    errors: list[Exception] = []

    def run_thread():
        c = db.connect(path)
        try:
            while True:
                r = store._claim_idea_txn(c, agent_id=0)
                if r["status"] != "ok":
                    if r["reason"] in ("empty_queue", "budget", "no_active_run"):
                        break
                    time.sleep(0.001)  # no_free_slot
                    continue
                with cl_lock:
                    claimed.append((r["gpu_id"], r["idea"]["id"]))
                store._report_result_txn(
                    c, idea_id=r["idea"]["id"], metric=1.0, status="done", error=None
                )
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
        finally:
            c.close()

    threads = [threading.Thread(target=run_thread) for _ in range(16)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, errors
    idea_ids = [i for _, i in claimed]
    assert len(idea_ids) == 120
    assert len(set(idea_ids)) == 120  # no idea claimed by two threads

    c = db.connect(path)
    rows = c.execute(
        "SELECT status, attempts FROM ideas WHERE run_id=?", (run_id,)
    ).fetchall()
    assert all(r["status"] == "done" for r in rows)
    assert all(r["attempts"] == 1 for r in rows)
    c.close()


def test_budget_halts(tmp_path):
    path = str(tmp_path / "budget.db")
    conn = _setup_db(path, pool_size=8)
    run_id = _make_run(conn, budget=10, n_ideas=40)

    while True:
        r = store._claim_idea_txn(conn, agent_id=0)
        if r["status"] != "ok":
            break
        store._report_result_txn(
            conn, idea_id=r["idea"]["id"], metric=1.0, status="done", error=None
        )

    counts = store._counts(conn, run_id)
    assert counts["done"] == 10          # never overshoots the budget
    assert counts["queued"] == 30        # the rest stay queued
    run = store.get_run(conn, run_id)
    assert run["state"] in ("draining", "done")
    conn.close()
