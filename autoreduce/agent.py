"""The worker's agent: a Claude Agent SDK session that writes a METHOD for the
run's sealed Task, sealed so it cannot touch the MEASUREMENT.

Task-agnostic: everything domain-specific (interface, prose, sample methods,
the benchmark command) comes from the `Task`, so adding a domain needs no change
here.

Sealing (path/permission, not instruction):
* `can_use_tool` allows Write/Edit/Read only within the worker's workspace and
  allows only the in-process `mcp__bench__*` tools; everything else is denied.
  Write/Edit/Read are kept OUT of `allowed_tools` precisely so they route
  through this guard (an allowlisted tool is auto-approved and never gated).
* Bash / web / discovery tools are hard-denied, so the agent cannot execute
  arbitrary code or reach the sealed `bench/` package.
* The reported metric is ALWAYS a worker-run sealed benchmark over the final
  `method.py` (`_finalize`), never anything the agent claims; `submit` carries
  only text (a diff + an optional follow-up).

A `fake_agent_session` (no SDK / no key) writes the task's sample method so the
whole loop is provable on a laptop without credentials.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from typing import Any, Callable

from .bench import Task
from .config import settings

OnLog = Callable[[str], None]
_BENCH_TIMEOUT = 30
METHOD_FILE = "method.py"


@dataclass
class AgentResult:
    metric: float | None
    baseline: float | None
    status: str            # "done" | "failed"
    error: str | None
    method_diff: str | None
    followup: str | None

    @classmethod
    def failed(cls, error: str, *, method_diff: str | None = None,
               followup: str | None = None) -> "AgentResult":
        return cls(metric=None, baseline=None, status="failed", error=error,
                   method_diff=method_diff, followup=followup)


# --- the sealed benchmark subprocess (worker-owned) ------------------------

def _run_sealed_bench(method_path: str, cvd: str | None, task_id: str) -> dict[str, Any]:
    env = {**os.environ}
    if cvd is not None:
        env["CUDA_VISIBLE_DEVICES"] = cvd
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "autoreduce.bench", task_id, method_path],
            capture_output=True, text=True, timeout=_BENCH_TIMEOUT, env=env,
        )
    except subprocess.TimeoutExpired:
        return {"metric": None, "baseline": None, "status": "failed",
                "error": "benchmark timed out", "summary": None}
    line = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else ""
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return {"metric": None, "baseline": None, "status": "failed",
                "error": f"benchmark produced no result: {proc.stderr[:300]}",
                "summary": None}


def _finalize(workspace: str, *, cvd: str | None, task_id: str,
              method_diff: str | None, followup: str | None) -> AgentResult:
    """The authoritative measurement: the worker runs the sealed benchmark on the
    final method.py. This number — not anything the agent says — is reported."""
    method_path = os.path.join(workspace, METHOD_FILE)
    if not os.path.exists(method_path):
        return AgentResult.failed("agent wrote no method.py",
                                  method_diff=method_diff, followup=followup)
    res = _run_sealed_bench(method_path, cvd, task_id)
    if res.get("status") == "ok" and isinstance(res.get("metric"), (int, float)):
        return AgentResult(metric=res["metric"], baseline=res.get("baseline"),
                           status="done", error=None,
                           method_diff=method_diff or res.get("summary"),
                           followup=followup)
    return AgentResult.failed(res.get("error") or "method did not run",
                              method_diff=method_diff, followup=followup)


# --- workspace -------------------------------------------------------------

def prepare_workspace(gpu_id: int) -> str:
    ws = os.path.abspath(os.path.join("run", f"gpu{gpu_id}", "workspace"))
    shutil.rmtree(ws, ignore_errors=True)
    os.makedirs(ws, exist_ok=True)
    return ws


# --- prompts (built from the Task) -----------------------------------------

def _system_prompt(task: Task) -> str:
    return (
        f"You are an autonomous research engineer. Domain: {task.domain_blurb}\n\n"
        "You are given a hypothesis and a fixed Python interface. Your job:\n"
        f"1. Write a file named exactly `method.py` in your working directory "
        f"that defines `class Strategy({task.interface_name})` realizing the "
        f"hypothesis. Import the interface with `{task.interface_import}`. Use "
        "only the Python standard library; keep it self-contained.\n"
        "2. Call the `run_benchmark` tool to measure your method "
        f"({'higher' if task.direction == 'maximize' else 'lower'} "
        f"{task.objective_name} is better). Iterate to improve it.\n"
        "3. As soon as you have a working method that beats the baseline, call "
        "`submit` with a one-line summary and an optional follow-up idea. Do NOT "
        "keep tweaking once it works — submit within a few iterations.\n"
        "You have NO shell and may only write inside your working directory. Do "
        "not attempt to read or modify anything outside it."
    )


def _build_user_prompt(task: Task, hypothesis: str, digest: dict[str, Any],
                       workspace: str) -> str:
    tried = [t.get("hypothesis", "") for t in digest.get("tried_hypotheses", [])][:12]
    top = digest.get("top_ideas", [])[:3]
    parts = [
        f"Your working directory is exactly:\n  {workspace}\n"
        "Write your file there using the RELATIVE path `method.py` (just "
        "`method.py`, not an absolute path). You can only write inside this "
        "directory; writes anywhere else are denied.\n",
        f"HYPOTHESIS TO IMPLEMENT:\n{hypothesis}\n",
        f"THE SEALED INTERFACE (read-only, already importable):\n```python\n"
        f"{task.interface_source()}\n```",
    ]
    if top:
        parts.append("Best methods so far (for context, do not copy verbatim):\n"
                     + json.dumps(top, indent=2))
    if tried:
        parts.append("Already-tried hypotheses (yours is different):\n- "
                     + "\n- ".join(t for t in tried if t))
    parts.append("Write method.py, benchmark it, iterate, then submit.")
    return "\n\n".join(parts)


# --- the sealing path guard ------------------------------------------------

def _path_guard(workspace: str):
    from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny

    ws = os.path.realpath(workspace)

    def _under(fp: str) -> bool:
        target = fp if os.path.isabs(fp) else os.path.join(ws, fp)
        real = os.path.realpath(target)
        return real == ws or real.startswith(ws + os.sep)

    async def guard(tool_name: str, input_data: dict[str, Any], context: Any):
        if tool_name.startswith("mcp__bench__"):
            return PermissionResultAllow()
        if tool_name in ("Write", "Edit", "MultiEdit", "Read", "NotebookEdit"):
            fp = (input_data.get("file_path") or input_data.get("path")
                  or input_data.get("notebook_path") or "")
            ok = bool(fp) and _under(fp)
            if not ok:
                print(f"[guard] DENY {tool_name} fp={fp!r}", file=sys.stderr, flush=True)
                return PermissionResultDeny(message=f"path outside workspace denied: {fp}")
            return PermissionResultAllow()
        print(f"[guard] DENY {tool_name}", file=sys.stderr, flush=True)
        return PermissionResultDeny(message=f"tool not permitted: {tool_name}")

    return guard


def _make_bench_server(workspace: str, record: dict[str, Any], cvd: str | None,
                       task_id: str, on_log: OnLog):
    from claude_agent_sdk import create_sdk_mcp_server, tool

    @tool("run_benchmark", "Measure the method.py you wrote on the sealed "
          "benchmark and return its score vs the baseline.", {})
    async def run_benchmark(args: dict[str, Any]) -> dict[str, Any]:
        method_path = os.path.join(workspace, METHOD_FILE)
        if not os.path.exists(method_path):
            return {"content": [{"type": "text",
                                 "text": "No method.py yet — write it first."}]}
        res = _run_sealed_bench(method_path, cvd, task_id)
        record["runs"] = record.get("runs", 0) + 1
        if res.get("status") == "ok":
            m = res.get("metric")
            if m is not None and (record.get("best") is None or m > record["best"]):
                record["best"] = m
            on_log(f"benchmark: {res.get('metric')} — {res.get('summary')}")
            return {"content": [{"type": "text",
                                 "text": f"score={res.get('metric')} "
                                         f"(baseline {res.get('baseline')}). "
                                         f"{res.get('summary')}"}]}
        on_log(f"benchmark failed: {(res.get('error') or '')[:80]}")
        return {"content": [{"type": "text",
                             "text": f"FAILED: {res.get('error')}\nFix method.py and re-run."}]}

    @tool("submit", "Submit your finished method.",
          {"type": "object",
           "properties": {"summary": {"type": "string",
                                      "description": "one-line description of your method"},
                          "followup": {"type": "string",
                                       "description": "optional next idea to try"}},
           "required": ["summary"]})
    async def submit(args: dict[str, Any]) -> dict[str, Any]:
        record["method_diff"] = (args.get("summary") or "")[:300]
        record["followup"] = (args.get("followup") or "").strip()[:300] or None
        record["submitted"] = True
        on_log("submitted")
        return {"content": [{"type": "text", "text": "Submitted. You may stop now."}]}

    return create_sdk_mcp_server(name="bench", version="1.0.0",
                                 tools=[run_benchmark, submit])


async def run_agent_session(*, task: Task, workspace: str, hypothesis: str,
                            digest: dict[str, Any], cvd: str | None,
                            on_log: OnLog) -> AgentResult:
    from claude_agent_sdk import ClaudeAgentOptions, query

    record: dict[str, Any] = {}
    server = _make_bench_server(workspace, record, cvd, task.id, on_log)
    options = ClaudeAgentOptions(
        cwd=workspace,
        model=settings.agent_model,
        max_turns=settings.agent_max_turns,
        max_budget_usd=settings.agent_max_budget_usd,
        system_prompt=_system_prompt(task),
        mcp_servers={"bench": server},
        # Write/Edit/Read are NOT allowlisted on purpose: that routes them
        # through can_use_tool (the path guard). Allowlisting auto-approves and
        # bypasses the guard.
        allowed_tools=["mcp__bench__run_benchmark", "mcp__bench__submit"],
        disallowed_tools=["Bash", "BashOutput", "KillShell", "WebFetch",
                          "WebSearch", "Glob", "Grep", "Task"],
        can_use_tool=_path_guard(workspace),
        permission_mode="default",
        setting_sources=[],
    )
    prompt = _build_user_prompt(task, hypothesis, digest, workspace)

    async def _prompt_stream():
        # can_use_tool requires streaming-input mode → one user message.
        yield {"type": "user", "session_id": "",
               "message": {"role": "user", "content": prompt},
               "parent_tool_use_id": None}

    try:
        async for _msg in query(prompt=_prompt_stream(), options=options):
            pass  # the agent drives itself via tools; logging happens inside them
    except Exception as exc:  # noqa: BLE001 — max-turns/budget/SDK error: still measure
        on_log(f"session ended: {str(exc)[:120]}")

    return _finalize(workspace, cvd=cvd, task_id=task.id,
                     method_diff=record.get("method_diff"),
                     followup=record.get("followup"))


# --- the key-free fake agent -----------------------------------------------

def fake_agent_session(*, task: Task, workspace: str, hypothesis: str,
                       cvd: str | None, on_log: OnLog) -> AgentResult:
    """Deterministic stand-in for the Agent SDK: writes the task's sample method
    (sometimes the broken one, to exercise graceful failure), then finalizes."""
    h = int(hashlib.sha256(hypothesis.encode()).hexdigest(), 16)
    broken = (h % 10) < 3  # ~30% of ideas fail, like a real run
    on_log("writing method.py")
    with open(os.path.join(workspace, METHOD_FILE), "w") as fh:
        fh.write(task.sample_method(broken=broken))
    diff = "deliberately broken (fake)" if broken else "task sample method (fake)"
    followup = None if broken else "vary the method's key parameter"
    on_log("method failed" if broken else "submitted")
    return _finalize(workspace, cvd=cvd, task_id=task.id, method_diff=diff,
                     followup=followup)
