"""Key-free tests for the agentic worker (fake agent, sealed metric, path guard).

No API key and no Claude Code CLI required: these exercise sealed-metric
integrity, the workspace path-permission guard, and the report path.
"""

from __future__ import annotations

import asyncio
import os

from autoreduce import agent, db, store
from autoreduce.bench import load_task

EXAMPLES = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "examples"))
TASK = load_task("specdec")


def _noop(_line: str) -> None:
    pass


def test_fake_agent_produces_sealed_metrics_and_failures(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # workspaces are created under ./run/gpu*
    # tasks dir must be absolute so the bench subprocess finds it after chdir
    monkeypatch.setenv("AUTOREDUCE_TASKS_DIR", EXAMPLES)
    done = failed = 0
    for i in range(24):
        ws = agent.prepare_workspace(gpu_id=i % 8)
        res = agent.fake_agent_session(
            task=TASK, workspace=ws, hypothesis=f"hypothesis number {i}",
            cvd=str(i % 8), on_log=_noop)
        method = os.path.join(ws, "method.py")
        assert os.path.exists(method)
        assert os.path.realpath(method).startswith(os.path.realpath(ws) + os.sep)
        if res.status == "done":
            done += 1
            assert res.metric is not None and res.metric > 1.0
            assert res.baseline == 1.0
            assert res.method_diff
            # METRIC INTEGRITY: equals an independent sealed run of method.py
            assert res.metric == TASK.run(method)["metric"]
        else:
            failed += 1
            assert res.metric is None
            assert res.error
    assert done > 0 and failed > 0   # a realistic mix, like a live run


def test_path_guard_confines_to_workspace(tmp_path):
    from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny

    ws = str(tmp_path / "ws")
    os.makedirs(ws)
    guard = agent._path_guard(ws)

    async def check(name, inp):
        return await guard(name, inp, None)

    assert isinstance(asyncio.run(check("Write", {"file_path": "method.py"})),
                      PermissionResultAllow)
    assert isinstance(asyncio.run(check("Write", {"file_path": "/etc/passwd"})),
                      PermissionResultDeny)
    assert isinstance(asyncio.run(check("Edit", {"file_path": "../../secret"})),
                      PermissionResultDeny)
    assert isinstance(asyncio.run(check("Bash", {"command": "cat ../bench/task.py"})),
                      PermissionResultDeny)
    assert isinstance(asyncio.run(check("mcp__bench__run_benchmark", {})),
                      PermissionResultAllow)


def test_report_path_persists_agent_fields(tmp_path):
    db.setup(str(tmp_path / "r.db"), pool_size=8)
    conn = db.conn()
    run_id = store.create_run(conn, prompt="p", budget_total=10, seed=1,
                              objective_name="speedup", task_id="specdec")
    store.set_run_state(conn, run_id, "running")
    store.insert_idea(conn, run_id=run_id, config={"hypothesis": "n-gram lookup"},
                      origin="seed", rationale=None)
    claimed = store._claim_idea_txn(conn, agent_id=3)
    idea_id = claimed["idea"]["id"]
    assert claimed["idea"]["config"]["hypothesis"] == "n-gram lookup"
    assert claimed["task"] == "specdec"

    store._report_result_txn(conn, idea_id=idea_id, metric=1.73, status="done",
                             error=None, method_diff="n-gram window=4",
                             followup="try window=6", baseline=1.0)
    row = conn.execute("SELECT * FROM ideas WHERE id=?", (idea_id,)).fetchone()
    assert row["status"] == "done" and row["metric"] == 1.73
    assert row["method_diff"] == "n-gram window=4"
    assert row["followup"] == "try window=6"
    assert row["baseline_metric"] == 1.0

    digest = store.read_digest(conn, run_id)
    assert digest["top_ideas"][0]["hypothesis"] == "n-gram lookup"
    assert digest["top_ideas"][0]["method_diff"] == "n-gram window=4"
    assert "try window=6" in digest["followups"]
    db.close()
