"""The transactional core: claim/report/reaper, run + idea CRUD, snapshot.

Every mutating function comes in two layers:

* a synchronous ``_*_txn(conn, ...)`` helper that runs one ``BEGIN IMMEDIATE``
  transaction on a given connection. These are pure and reusable — the key-free
  concurrency test drives them directly from many threads with separate
  connections to prove the SQL guard prevents double-allocation.
* an ``async`` wrapper that takes ``db.STATE_LOCK`` and runs the helper on the
  control plane's single shared connection.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from typing import Any

from . import db


# --- canonical config helpers ----------------------------------------------

def canonical_json(config: dict[str, Any]) -> str:
    return json.dumps(config, sort_keys=True, separators=(",", ":"))


def config_hash(config_json: str) -> str:
    return hashlib.sha256(config_json.encode("utf-8")).hexdigest()


def _better(direction: str) -> str:
    """SQL ordering keyword: best-first."""
    return "DESC" if direction == "maximize" else "ASC"


# --- run helpers -----------------------------------------------------------

def create_run(
    conn: sqlite3.Connection,
    *,
    prompt: str,
    budget_total: int,
    seed: int,
    task_id: str,
    direction: str = "maximize",
    objective_name: str | None = None,
    schema_json: str | None = None,
    model: str | None = None,
) -> int:
    cur = conn.execute(
        """INSERT INTO runs(created_at, prompt, objective_name, direction,
                            schema_json, budget_total, state, model, seed,
                            task_id, planner_status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 'idle')""",
        (time.time(), prompt, objective_name, direction, schema_json,
         budget_total, model, seed, task_id),
    )
    rid = cur.lastrowid
    assert rid is not None
    return int(rid)


def active_run(conn: sqlite3.Connection) -> sqlite3.Row | None:
    """The run currently consuming the pool (running or draining), if any."""
    return conn.execute(
        "SELECT * FROM runs WHERE state IN ('running','draining') "
        "ORDER BY id DESC LIMIT 1"
    ).fetchone()


def latest_run(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 1").fetchone()


def next_pending_run(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM runs WHERE state='pending' ORDER BY id ASC LIMIT 1"
    ).fetchone()


def get_run(conn: sqlite3.Connection, run_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()


def set_run_contract(conn: sqlite3.Connection, run_id: int, *, objective_name: str,
                     direction: str, schema_json: str) -> None:
    conn.execute(
        "UPDATE runs SET objective_name=?, direction=?, schema_json=? WHERE id=?",
        (objective_name, direction, schema_json, run_id),
    )


def set_run_state(conn: sqlite3.Connection, run_id: int, state: str,
                  error: str | None = None) -> None:
    conn.execute(
        "UPDATE runs SET state=?, error=COALESCE(?, error) WHERE id=?",
        (state, error, run_id),
    )


def set_planner_status(conn: sqlite3.Connection, run_id: int, *,
                       status: str | None = None, reasoning: str | None = None,
                       exploring_region: str | None = None) -> None:
    conn.execute(
        """UPDATE runs SET
              planner_status   = COALESCE(?, planner_status),
              latest_reasoning = COALESCE(?, latest_reasoning),
              exploring_region = COALESCE(?, exploring_region)
           WHERE id=?""",
        (status, reasoning, exploring_region, run_id),
    )


# --- idea helpers ----------------------------------------------------------

def insert_idea(conn: sqlite3.Connection, *, run_id: int, config: dict[str, Any],
                origin: str, rationale: str | None) -> bool:
    """Insert a queued idea. De-duped on config_hash. Returns True if inserted."""
    cj = canonical_json(config)
    h = config_hash(cj)
    cur = conn.execute(
        """INSERT OR IGNORE INTO ideas(run_id, config_json, config_hash, status,
                                       origin, rationale, created_at, attempts)
           VALUES (?, ?, ?, 'queued', ?, ?, ?, 0)""",
        (run_id, cj, h, origin, rationale, time.time()),
    )
    return cur.rowcount == 1


def queue_depth(conn: sqlite3.Connection, run_id: int) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM ideas WHERE run_id=? AND status='queued'", (run_id,)
    ).fetchone()[0]


def _counts(conn: sqlite3.Connection, run_id: int) -> dict[str, int]:
    rows = conn.execute(
        "SELECT status, COUNT(*) c FROM ideas WHERE run_id=? GROUP BY status",
        (run_id,),
    ).fetchall()
    out = {"queued": 0, "running": 0, "done": 0, "failed": 0}
    for r in rows:
        out[r["status"]] = r["c"]
    out["total"] = sum(out[k] for k in ("queued", "running", "done", "failed"))
    return out


# --- run-state transitions -------------------------------------------------

def _maybe_transition_run_state(conn: sqlite3.Connection, run_id: int) -> None:
    """budget hit -> draining; draining + idle pool + empty queue -> done."""
    run = get_run(conn, run_id)
    if run is None or run["state"] not in ("running", "draining"):
        return
    c = _counts(conn, run_id)
    state = run["state"]
    if state == "running" and c["done"] >= run["budget_total"]:
        conn.execute("UPDATE runs SET state='draining' WHERE id=?", (run_id,))
        state = "draining"
    if state == "draining":
        busy = conn.execute(
            "SELECT COUNT(*) FROM gpu_slots WHERE status='busy'"
        ).fetchone()[0]
        if busy == 0 and c["queued"] == 0 and c["running"] == 0:
            conn.execute(
                "UPDATE runs SET state='done', planner_status='done' WHERE id=?",
                (run_id,),
            )


# --- claim_idea ------------------------------------------------------------

def _claim_idea_txn(conn: sqlite3.Connection, *, agent_id: int,
                    now: float | None = None) -> dict[str, Any]:
    now = time.time() if now is None else now
    conn.execute("BEGIN IMMEDIATE")
    try:
        run = active_run(conn)
        if run is None or run["state"] != "running":
            conn.execute("COMMIT")
            return {"status": "no_work", "reason": "no_active_run",
                    "run_state": run["state"] if run else None}

        c = _counts(conn, run["id"])
        # Budget gate: never let (done + running) exceed the budget. `running`
        # is committed budget, which prevents overshoot under concurrency.
        if c["done"] + c["running"] >= run["budget_total"]:
            conn.execute("COMMIT")
            return {"status": "no_work", "reason": "budget", "run_state": run["state"]}

        slot = conn.execute(
            """UPDATE gpu_slots SET status='busy', agent_id=?, claimed_at=?,
                                    heartbeat_at=?
               WHERE gpu_id = (SELECT gpu_id FROM gpu_slots
                               WHERE status='free' ORDER BY gpu_id LIMIT 1)
               RETURNING gpu_id""",
            (agent_id, now, now),
        ).fetchone()
        if slot is None:
            conn.execute("COMMIT")
            return {"status": "no_work", "reason": "no_free_slot",
                    "run_state": run["state"]}
        gpu_id = slot["gpu_id"]

        idea = conn.execute(
            """UPDATE ideas SET status='running', claimed_at=?, gpu_id=?,
                                agent_id=?, attempts=attempts+1
               WHERE id = (SELECT id FROM ideas
                           WHERE run_id=? AND status='queued'
                           ORDER BY id LIMIT 1)
               RETURNING id, config_json""",
            (now, gpu_id, agent_id, run["id"]),
        ).fetchone()
        if idea is None:
            # Slot grabbed but queue empty: release it in the same transaction.
            conn.execute(
                """UPDATE gpu_slots SET status='free', agent_id=NULL, idea_id=NULL,
                                        claimed_at=NULL, heartbeat_at=NULL
                   WHERE gpu_id=?""",
                (gpu_id,),
            )
            conn.execute("COMMIT")
            return {"status": "no_work", "reason": "empty_queue",
                    "run_state": run["state"]}

        conn.execute("UPDATE gpu_slots SET idea_id=? WHERE gpu_id=?",
                     (idea["id"], gpu_id))
        conn.execute("COMMIT")
        return {
            "status": "ok",
            "idea": {"id": idea["id"], "config": json.loads(idea["config_json"])},
            "task": run["task_id"],
            "gpu_id": gpu_id,
            "cuda_visible_devices": str(gpu_id),
        }
    except Exception:
        conn.execute("ROLLBACK")
        raise


# --- report_result ---------------------------------------------------------

def _report_result_txn(conn: sqlite3.Connection, *, idea_id: int,
                       metric: float | None, status: str, error: str | None,
                       method_diff: str | None = None, followup: str | None = None,
                       baseline: float | None = None,
                       now: float | None = None) -> dict[str, Any]:
    now = time.time() if now is None else now
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            """UPDATE ideas SET status=?, metric=?, error=?, finished_at=?,
                                method_diff=?, followup=?, baseline_metric=?
               WHERE id=? AND status='running'
               RETURNING run_id, gpu_id""",
            (status, metric, error, now, method_diff, followup, baseline, idea_id),
        ).fetchone()
        if row is None:
            # Already handled (reaper got there first) or duplicate report.
            conn.execute("COMMIT")
            return {"accepted": False, "reason": "not_running"}

        # Free the slot only if it is still bound to THIS idea.
        conn.execute(
            """UPDATE gpu_slots SET status='free', agent_id=NULL, idea_id=NULL,
                                    claimed_at=NULL, heartbeat_at=NULL
               WHERE idea_id=?""",
            (idea_id,),
        )
        _maybe_transition_run_state(conn, row["run_id"])
        conn.execute("COMMIT")
        return {"accepted": True}
    except Exception:
        conn.execute("ROLLBACK")
        raise


# --- heartbeat -------------------------------------------------------------

def _heartbeat_txn(conn: sqlite3.Connection, *, gpu_id: int, idea_id: int,
                   now: float | None = None) -> dict[str, Any]:
    now = time.time() if now is None else now
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "UPDATE gpu_slots SET heartbeat_at=? WHERE gpu_id=? AND idea_id=?",
            (now, gpu_id, idea_id),
        )
        conn.execute("COMMIT")
        return {"ok": cur.rowcount == 1}
    except Exception:
        conn.execute("ROLLBACK")
        raise


# --- reaper ----------------------------------------------------------------

def _reaper_txn(conn: sqlite3.Connection, *, heartbeat_timeout: float,
                harness_timeout: float, max_attempts: int = 3,
                now: float | None = None) -> list[int]:
    """Free slots whose worker is dead/wedged. Returns freed gpu_ids."""
    now = time.time() if now is None else now
    conn.execute("BEGIN IMMEDIATE")
    freed: list[int] = []
    try:
        reapable = conn.execute(
            """SELECT gpu_id, idea_id FROM gpu_slots
               WHERE status='busy'
                 AND ( (heartbeat_at IS NOT NULL AND ? - heartbeat_at > ?)
                       OR (claimed_at IS NOT NULL AND ? - claimed_at > ?) )""",
            (now, heartbeat_timeout, now, harness_timeout),
        ).fetchall()
        run_ids: set[int] = set()
        for slot in reapable:
            idea_id = slot["idea_id"]
            if idea_id is not None:
                irow = conn.execute(
                    "SELECT run_id, attempts FROM ideas WHERE id=? AND status='running'",
                    (idea_id,),
                ).fetchone()
                if irow is not None:
                    run_ids.add(irow["run_id"])
                    if irow["attempts"] < max_attempts:
                        conn.execute(
                            """UPDATE ideas SET status='queued', claimed_at=NULL,
                                                gpu_id=NULL, agent_id=NULL
                               WHERE id=? AND status='running'""",
                            (idea_id,),
                        )
                    else:
                        conn.execute(
                            """UPDATE ideas SET status='failed', finished_at=?,
                                                error='reaped: max attempts'
                               WHERE id=? AND status='running'""",
                            (now, idea_id),
                        )
            conn.execute(
                """UPDATE gpu_slots SET status='free', agent_id=NULL, idea_id=NULL,
                                        claimed_at=NULL, heartbeat_at=NULL
                   WHERE gpu_id=?""",
                (slot["gpu_id"],),
            )
            freed.append(slot["gpu_id"])
        for rid in run_ids:
            _maybe_transition_run_state(conn, rid)
        conn.execute("COMMIT")
        return freed
    except Exception:
        conn.execute("ROLLBACK")
        raise


# --- read helpers (no lock needed) -----------------------------------------

def top_configs(conn: sqlite3.Connection, run_id: int, direction: str,
                k: int = 5) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""SELECT config_json, metric, origin FROM ideas
            WHERE run_id=? AND status='done' AND metric IS NOT NULL
            ORDER BY metric {_better(direction)} LIMIT ?""",
        (run_id, k),
    ).fetchall()
    return [
        {"config": json.loads(r["config_json"]), "metric": r["metric"],
         "origin": r["origin"]}
        for r in rows
    ]


def explored_regions(conn: sqlite3.Connection, run_id: int,
                     schema: dict[str, Any] | None, bins: int = 5) -> dict[str, Any]:
    """Per-parameter coverage of the schema so the planner can target gaps."""
    if not schema or schema.get("type") != "object":
        return {}
    props = schema.get("properties", {})
    configs = [
        json.loads(r["config_json"])
        for r in conn.execute(
            "SELECT config_json FROM ideas WHERE run_id=?", (run_id,)
        ).fetchall()
    ]
    coverage: dict[str, Any] = {}
    for name, spec in props.items():
        t = spec.get("type")
        if t in ("number", "integer") and "minimum" in spec and "maximum" in spec:
            lo, hi = spec["minimum"], spec["maximum"]
            counts = [0] * bins
            span = (hi - lo) or 1
            for cfg in configs:
                v = cfg.get(name)
                if isinstance(v, (int, float)):
                    idx = min(bins - 1, max(0, int((v - lo) / span * bins)))
                    counts[idx] += 1
            coverage[name] = {"range": [lo, hi], "bins": counts}
        elif "enum" in spec:
            counts = {str(val): 0 for val in spec["enum"]}
            for cfg in configs:
                key = str(cfg.get(name))
                if key in counts:
                    counts[key] += 1
            coverage[name] = {"enum": counts}
    return coverage


def _hypothesis(config_json: str) -> str:
    try:
        return json.loads(config_json).get("hypothesis", "")
    except (json.JSONDecodeError, AttributeError):
        return ""


def top_ideas(conn: sqlite3.Connection, run_id: int, direction: str,
              k: int = 5) -> list[dict[str, Any]]:
    """Best verified ideas — what the planner exploits near."""
    rows = conn.execute(
        f"""SELECT config_json, metric, method_diff, origin FROM ideas
            WHERE run_id=? AND status='done' AND metric IS NOT NULL
            ORDER BY metric {_better(direction)} LIMIT ?""",
        (run_id, k),
    ).fetchall()
    return [
        {"hypothesis": _hypothesis(r["config_json"]), "metric": r["metric"],
         "method_diff": r["method_diff"], "origin": r["origin"]}
        for r in rows
    ]


def tried_hypotheses(conn: sqlite3.Connection, run_id: int,
                     limit: int = 40) -> list[dict[str, Any]]:
    """Hypotheses already queued/run — so the planner dedups and explores new ones."""
    rows = conn.execute(
        """SELECT config_json, status, metric FROM ideas
           WHERE run_id=? ORDER BY id DESC LIMIT ?""",
        (run_id, limit),
    ).fetchall()
    return [
        {"hypothesis": _hypothesis(r["config_json"]), "status": r["status"],
         "metric": r["metric"]}
        for r in rows
    ]


def recent_followups(conn: sqlite3.Connection, run_id: int,
                     limit: int = 8) -> list[str]:
    """Follow-up ideas the workers appended — the planner may promote these."""
    rows = conn.execute(
        """SELECT followup FROM ideas
           WHERE run_id=? AND followup IS NOT NULL AND followup != ''
           ORDER BY finished_at DESC LIMIT ?""",
        (run_id, limit),
    ).fetchall()
    return [r["followup"] for r in rows]


def read_digest(conn: sqlite3.Connection, run_id: int) -> dict[str, Any]:
    run = get_run(conn, run_id)
    direction = run["direction"] if run else "maximize"
    return {
        "top_ideas": top_ideas(conn, run_id, direction),
        "tried_hypotheses": tried_hypotheses(conn, run_id),
        "followups": recent_followups(conn, run_id),
        "queue_depth": queue_depth(conn, run_id),
    }


def _rank_key(direction: str):
    sign = 1 if direction == "maximize" else -1
    return lambda m: sign * m


def snapshot(conn: sqlite3.Connection) -> dict[str, Any]:
    """Full read model for /state and SSE (seq attached by the caller)."""
    run = active_run(conn) or latest_run(conn)
    slots = conn.execute(
        "SELECT * FROM gpu_slots ORDER BY gpu_id"
    ).fetchall()

    run_dict = None
    planner = None
    ideas_out: list[dict[str, Any]] = []
    stats = {"total": 0, "queued": 0, "running": 0, "done": 0, "failed": 0,
             "best_value": None, "best_idea_id": None}
    direction = "maximize"

    if run is not None:
        direction = run["direction"]
        c = _counts(conn, run["id"])
        stats.update(c)
        run_dict = {
            "id": run["id"], "prompt": run["prompt"], "state": run["state"],
            "objective_name": run["objective_name"], "direction": direction,
            "budget_total": run["budget_total"], "budget_spent": c["done"],
            "model": run["model"], "error": run["error"],
        }
        planner = {
            "status": run["planner_status"],
            "objective_name": run["objective_name"],
            "direction": direction,
            "budget_total": run["budget_total"],
            "budget_spent": c["done"],
            "latest_reasoning": run["latest_reasoning"],
            "exploring_region": run["exploring_region"],
        }
        rows = conn.execute(
            "SELECT * FROM ideas WHERE run_id=? ORDER BY id", (run["id"],)
        ).fetchall()
        for r in rows:
            ideas_out.append({
                "id": r["id"],
                "config": json.loads(r["config_json"]),
                "status": r["status"],
                "origin": r["origin"],
                "metric_value": r["metric"],
                "rationale": r["rationale"],
                "gpu_id": r["gpu_id"] if r["status"] == "running" else None,
                "agent": (f"worker-{r['agent_id']}"
                          if r["status"] == "running" and r["agent_id"] is not None
                          else None),
                "created_at": r["created_at"],
                "claimed_at": r["claimed_at"],
                "finished_at": r["finished_at"],
            })
        # rank done best-first; order rows done -> running -> queued -> failed
        done = [i for i in ideas_out if i["status"] == "done"
                and i["metric_value"] is not None]
        done.sort(key=lambda i: _rank_key(direction)(i["metric_value"]), reverse=True)
        for rank, i in enumerate(done, start=1):
            i["rank"] = rank
        if done:
            stats["best_value"] = done[0]["metric_value"]
            stats["best_idea_id"] = done[0]["id"]
        order = {"done": 0, "running": 1, "queued": 2, "failed": 3}
        ideas_out.sort(key=lambda i: (order.get(i["status"], 9),
                                      i.get("rank", 1e9), i["id"]))
        for i in ideas_out:
            i.setdefault("rank", None)

    slots_out = [{
        "gpu_id": s["gpu_id"],
        "status": s["status"],
        "idea_id": s["idea_id"],
        "agent": f"worker-{s['agent_id']}" if s["agent_id"] is not None else None,
        "claimed_at": s["claimed_at"],
    } for s in slots]

    return {
        "run": run_dict,
        "planner": planner,
        "slots": slots_out,
        "ideas": ideas_out,
        "stats": stats,
        "server_time": time.time(),
    }


# --- async wrappers (control plane, shared connection + STATE_LOCK) ---------

async def claim_idea(agent_id: int) -> dict[str, Any]:
    async with db.STATE_LOCK:
        return _claim_idea_txn(db.conn(), agent_id=agent_id)


async def report_result(idea_id: int, metric: float | None, status: str,
                        error: str | None = None, method_diff: str | None = None,
                        followup: str | None = None,
                        baseline: float | None = None) -> dict[str, Any]:
    async with db.STATE_LOCK:
        return _report_result_txn(db.conn(), idea_id=idea_id, metric=metric,
                                  status=status, error=error,
                                  method_diff=method_diff, followup=followup,
                                  baseline=baseline)


async def heartbeat(gpu_id: int, idea_id: int) -> dict[str, Any]:
    async with db.STATE_LOCK:
        return _heartbeat_txn(db.conn(), gpu_id=gpu_id, idea_id=idea_id)


async def reaper_pass(heartbeat_timeout: float, harness_timeout: float) -> list[int]:
    async with db.STATE_LOCK:
        return _reaper_txn(db.conn(), heartbeat_timeout=heartbeat_timeout,
                           harness_timeout=harness_timeout)
