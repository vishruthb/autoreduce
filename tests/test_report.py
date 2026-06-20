"""Key-free tests for the end-of-run report (build_report + render_markdown).

Domain-agnostic: uses a generic latency/throughput prompt, no domain coupling.
"""

from __future__ import annotations

import time

import pytest

from autoreduce import db, report, store


def _setup(path: str):
    conn = db.connect(path)
    db.init_schema(conn)
    db.seed_slots(conn, 2)
    return conn


def _finish(conn, idea_id, *, status, metric=None, baseline=None,
            method_diff=None, followup=None, error=None):
    now = time.time()
    conn.execute(
        "UPDATE ideas SET status=?, metric=?, baseline_metric=?, method_diff=?, "
        "followup=?, error=?, claimed_at=?, finished_at=? WHERE id=?",
        (status, metric, baseline, method_diff, followup, error, now, now + 1.5,
         idea_id),
    )


def _add(conn, run_id, hypothesis, origin):
    store.insert_idea(conn, run_id=run_id, config={"hypothesis": hypothesis},
                      origin=origin, rationale=f"because {hypothesis[:10]}")
    return conn.execute(
        "SELECT id FROM ideas WHERE run_id=? ORDER BY id DESC LIMIT 1", (run_id,)
    ).fetchone()["id"]


def test_unknown_run_raises(tmp_path):
    conn = _setup(str(tmp_path / "r.db"))
    with pytest.raises(ValueError):
        report.build_report(conn, 999)


def test_ranking_and_markdown_maximize(tmp_path):
    conn = _setup(str(tmp_path / "r.db"))
    rid = store.create_run(conn, prompt="Maximize requests served per second.",
                           budget_total=4, seed=1, task_id="t",
                           direction="maximize", objective_name="rps")
    a = _add(conn, rid, "cache hot keys", "seed")
    b = _add(conn, rid, "batch the writes", "exploit")
    c = _add(conn, rid, "compress payloads", "explore")
    _finish(conn, a, status="done", metric=120.0, baseline=100.0, method_diff="LRU cache")
    _finish(conn, b, status="done", metric=155.0, baseline=100.0,
            method_diff="write batching", followup="coalesce flushes")
    _finish(conn, c, status="failed", error="ImportError: zstd missing")

    rep = report.build_report(conn, rid)
    assert rep["summary"]["best_metric"] == 155.0
    assert rep["summary"]["best_idea_id"] == b
    assert rep["summary"]["done"] == 2 and rep["summary"]["failed"] == 1
    # ranked best-first
    done = [f for f in rep["findings"] if f["status"] == "done"]
    assert [f["rank"] for f in done] == [1, 2]
    assert done[0]["id"] == b
    assert "coalesce flushes" in rep["followups"]

    md = report.render_markdown(rep)
    assert "# Research report" in md
    assert "Maximize requests served per second." in md
    assert "## Findings" in md
    assert "write batching" in md
    assert "## Did not verify" in md
    assert "zstd missing" in md


def test_minimize_direction_ranks_low_first(tmp_path):
    conn = _setup(str(tmp_path / "r.db"))
    rid = store.create_run(conn, prompt="Minimize p99 latency.", budget_total=4,
                           seed=1, task_id="t", direction="minimize",
                           objective_name="p99_ms")
    a = _add(conn, rid, "lru", "seed")
    b = _add(conn, rid, "pool", "exploit")
    _finish(conn, a, status="done", metric=80.0)
    _finish(conn, b, status="done", metric=42.0)
    rep = report.build_report(conn, rid)
    assert rep["summary"]["best_metric"] == 42.0  # lower is better
    done = [f for f in rep["findings"] if f["status"] == "done"]
    assert done[0]["id"] == b and done[0]["rank"] == 1
    assert "↓ `p99_ms`" in report.render_markdown(rep)


def test_no_verified_methods_renders(tmp_path):
    conn = _setup(str(tmp_path / "r.db"))
    rid = store.create_run(conn, prompt="anything", budget_total=2, seed=1,
                           task_id="t", direction="maximize", objective_name="m")
    a = _add(conn, rid, "idea", "seed")
    _finish(conn, a, status="failed", error="boom")
    md = report.render_markdown(report.build_report(conn, rid))
    assert "_No verified methods yet._" in md
