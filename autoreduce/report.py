"""End-of-run report: turn a finished (or in-flight) run into a findings report.

Domain-agnostic — it reads only the run's objective + the agent-authored fields
(hypothesis, method_diff, followup) and the system-sealed metric. Usable two ways:

* the API serves it at ``GET /runs/{id}/report`` (JSON) and ``.../report.md``;
* the CLI ``python -m autoreduce.report [run_id]`` prints the markdown to stdout
  (defaults to the latest run) so a run is reproducible from the terminal alone.
"""

from __future__ import annotations

import sqlite3
import sys
from typing import Any

from . import store


def _hypothesis(config_json: str) -> str:
    import json
    try:
        return (json.loads(config_json) or {}).get("hypothesis", "") or ""
    except (ValueError, AttributeError):
        return ""


def build_report(conn: sqlite3.Connection, run_id: int) -> dict[str, Any]:
    """Structured report for one run. Raises ValueError if the run is unknown."""
    run = store.get_run(conn, run_id)
    if run is None:
        raise ValueError(f"no such run: {run_id}")
    direction = run["direction"] or "maximize"

    rows = conn.execute(
        """SELECT id, config_json, origin, status, rationale, metric,
                  baseline_metric, method_diff, followup, error,
                  claimed_at, finished_at
           FROM ideas WHERE run_id=? ORDER BY id""",
        (run_id,),
    ).fetchall()

    ideas: list[dict[str, Any]] = []
    for r in rows:
        dur = None
        if r["finished_at"] is not None and r["claimed_at"] is not None:
            dur = round(r["finished_at"] - r["claimed_at"], 1)
        ideas.append({
            "id": r["id"],
            "hypothesis": _hypothesis(r["config_json"]),
            "origin": r["origin"],
            "status": r["status"],
            "rationale": r["rationale"],
            "metric": r["metric"],
            "baseline": r["baseline_metric"],
            "method_diff": r["method_diff"],
            "followup": r["followup"],
            "error": r["error"],
            "duration_s": dur,
            "rank": None,
        })

    done = [i for i in ideas if i["status"] == "done" and i["metric"] is not None]
    done.sort(key=lambda i: i["metric"], reverse=(direction == "maximize"))
    for rank, i in enumerate(done, start=1):
        i["rank"] = rank

    counts = {"total": len(ideas), "done": 0, "failed": 0, "running": 0, "queued": 0}
    for i in ideas:
        counts[i["status"]] = counts.get(i["status"], 0) + 1
    baseline = next((i["baseline"] for i in done if i["baseline"] is not None), None)

    # findings = ranked successes first, then the failures (for the record)
    failed = [i for i in ideas if i["status"] == "failed"]
    findings = done + failed

    followups: list[str] = []
    for i in ideas:
        f = (i["followup"] or "").strip()
        if f and f not in followups:
            followups.append(f)

    return {
        "run": {
            "id": run["id"],
            "prompt": run["prompt"],
            "objective_name": run["objective_name"],
            "direction": direction,
            "state": run["state"],
            "model": run["model"],
            "task_id": run["task_id"],
            "budget_total": run["budget_total"],
            "budget_spent": counts["done"],
            "error": run["error"],
            "created_at": run["created_at"],
        },
        "summary": {
            **counts,
            "best_metric": done[0]["metric"] if done else None,
            "best_idea_id": done[0]["id"] if done else None,
            "baseline": baseline,
        },
        "findings": findings,
        "followups": followups,
    }


def _fmt(v: Any) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.4f}".rstrip("0").rstrip(".")
    return str(v)


def render_markdown(report: dict[str, Any]) -> str:
    run = report["run"]
    s = report["summary"]
    arrow = "↓" if run["direction"] == "minimize" else "↑"
    obj = run["objective_name"] or "objective"

    out: list[str] = []
    out.append(f"# Research report — run #{run['id']}")
    out.append("")
    out.append(f"**Prompt:** {run['prompt']}")
    out.append("")
    out.append(f"- **Objective:** {run['direction']} {arrow} `{obj}`")
    out.append(f"- **State:** {run['state']}")
    out.append(f"- **Budget:** {s['done']} / {run['budget_total']} experiments completed")
    if run["model"]:
        out.append(f"- **Planner model:** {run['model']}")
    if s["best_metric"] is not None:
        line = f"- **Best {obj}:** {_fmt(s['best_metric'])} (idea #{s['best_idea_id']})"
        if s["baseline"] is not None:
            line += f" vs baseline {_fmt(s['baseline'])}"
        out.append(line)
    out.append(f"- **Ideas:** {s['total']} total · {s['done']} done · "
               f"{s['failed']} failed · {s['running']} running · {s['queued']} queued")
    if run["error"]:
        out.append(f"- **Error:** {run['error']}")
    out.append("")

    findings = report["findings"]
    done = [f for f in findings if f["status"] == "done"]
    out.append("## Findings")
    out.append("")
    if not done:
        out.append("_No verified methods yet._")
    else:
        out.append(f"| Rank | {obj} | Origin | Method | Idea |")
        out.append("| ---: | ---: | :--- | :--- | :--- |")
        for f in done:
            method = (f["method_diff"] or f["hypothesis"] or "").replace("\n", " ")
            if len(method) > 90:
                method = method[:87] + "…"
            out.append(f"| {f['rank']} | {_fmt(f['metric'])} | {f['origin']} | "
                       f"{method} | #{f['id']} |")
    out.append("")

    # detail each verified method best-first
    for f in done:
        out.append(f"### {f['rank']}. {_fmt(f['metric'])} — {f['origin']} (idea #{f['id']})")
        out.append("")
        out.append(f"**Hypothesis:** {f['hypothesis'] or '—'}")
        out.append("")
        if f["method_diff"]:
            out.append(f"**What the agent built:** {f['method_diff']}")
            out.append("")
        if f["rationale"]:
            out.append(f"**Rationale:** {f['rationale']}")
            out.append("")
        meta = []
        if f["baseline"] is not None:
            meta.append(f"baseline {_fmt(f['baseline'])}")
        if f["duration_s"] is not None:
            meta.append(f"{f['duration_s']}s")
        if meta:
            out.append("_" + " · ".join(meta) + "_")
            out.append("")

    if report["followups"]:
        out.append("## Open follow-up ideas")
        out.append("")
        for f in report["followups"]:
            out.append(f"- {f}")
        out.append("")

    failed = [f for f in findings if f["status"] == "failed"]
    if failed:
        out.append("## Did not verify")
        out.append("")
        for f in failed:
            why = (f["error"] or "failed").replace("\n", " ")
            out.append(f"- **{f['hypothesis'] or 'idea #' + str(f['id'])}** — {why}")
        out.append("")

    return "\n".join(out).rstrip() + "\n"


def _main(argv: list[str]) -> int:
    from . import db
    from .config import settings

    conn = db.connect(settings.db_path)
    db.init_schema(conn)
    if len(argv) >= 1 and argv[0]:
        run_id = int(argv[0])
    else:
        run = store.latest_run(conn)
        if run is None:
            print("no runs found", file=sys.stderr)
            return 1
        run_id = run["id"]
    try:
        report = build_report(conn, run_id)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(render_markdown(report), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
