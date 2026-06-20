"""A pool worker — a plain OS process that runs ONE agent session at a time.

`python -m autoreduce.worker --id N --base-url http://127.0.0.1:8000`

Loops: claim an idea (a hypothesis) over HTTP, prepare a clean workspace, run a
bounded Claude Agent SDK session (or the deterministic fake agent) that writes a
method and is measured by the sealed benchmark, and ALWAYS report the **sealed**
metric + a short method-diff + an optional follow-up. NO database access; the
metric is the system's, never the agent's. Idles between runs.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import threading
import time
from typing import Any

import httpx

from . import agent, bench
from .config import settings


def _wait_for_api(client: httpx.Client) -> None:
    delay = 0.2
    for _ in range(60):
        try:
            if client.get("/health").status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(delay)
        delay = min(delay * 1.5, 2.0)


def _heartbeat_loop(client: httpx.Client, gpu_id: int, idea_id: int,
                    stop: threading.Event) -> None:
    while not stop.wait(1.0):
        try:
            client.post("/heartbeat", json={"gpu_id": gpu_id, "idea_id": idea_id})
        except httpx.HTTPError:
            pass


def _get_digest(client: httpx.Client) -> dict:
    try:
        return client.get("/read_digest").json()
    except (httpx.HTTPError, json.JSONDecodeError):
        return {}


def _report(client: httpx.Client, idea_id: int, result: agent.AgentResult,
            gpu_id: int | None, agent_id: int) -> None:
    payload = {
        "idea_id": idea_id, "metric": result.metric, "status": result.status,
        "error": result.error, "gpu_id": gpu_id, "agent_id": agent_id,
        "method_diff": result.method_diff, "followup": result.followup,
        "baseline": result.baseline,
    }
    for _ in range(5):
        try:
            client.post("/report_result", json=payload)
            return
        except httpx.HTTPError:
            time.sleep(0.3)


def _endpoint(claim: dict[str, Any], *names: str) -> str | None:
    endpoints = claim.get("endpoints")
    for source in (claim, endpoints if isinstance(endpoints, dict) else {}):
        for name in names:
            value = source.get(name)
            if isinstance(value, str) and value:
                return value
    return None


def _post_callback(client: httpx.Client, url: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        response = client.post(url, json=payload)
        if response.status_code >= 400:
            return {"status": "failed", "error": f"HTTP {response.status_code}"}
        try:
            data = response.json()
        except json.JSONDecodeError:
            data = {}
        if (data.get("status") == "failed" or data.get("ok") is False
                or data.get("accepted") is False):
            return {"status": "failed", "error": data.get("error") or "callback rejected"}
        return {"status": "ok", "message": data.get("message") or data.get("detail")}
    except httpx.HTTPError as exc:
        return {"status": "failed", "error": str(exc)}


def _method_payload(*, idea_id: int, worker_id: int, task_id: str, workspace: str,
                    result: agent.AgentResult | None, phase: str) -> dict[str, Any]:
    method_source = agent.read_method_source(workspace)
    payload: dict[str, Any] = {
        "idea_id": idea_id,
        "agent_id": worker_id,
        "task": task_id,
        "workspace": workspace,
        "method_path": os.path.join(workspace, agent.METHOD_FILE),
        "method_source": method_source,
        "phase": phase,
    }
    if result is not None:
        payload.update({
            "status": result.status,
            "error": result.error,
            "method_diff": result.method_diff,
            "followup": result.followup,
            "metric": result.metric,
            "baseline": result.baseline,
        })
    return payload


async def _handle_idea(client: httpx.Client, worker_id: int, idea: dict,
                       task_id: str, gpu_id: int, cvd: str) -> None:
    idea_id = idea["id"]
    hypothesis = (idea.get("config") or {}).get("hypothesis", "")

    def on_log(line: str) -> None:
        try:
            client.post("/agent_log", json={"idea_id": idea_id, "gpu_id": gpu_id,
                                            "agent_id": worker_id, "line": line})
        except httpx.HTTPError:
            pass

    stop_hb = threading.Event()
    hb = threading.Thread(target=_heartbeat_loop,
                          args=(client, gpu_id, idea_id, stop_hb), daemon=True)
    hb.start()
    try:
        task = bench.load_task(task_id)
        workspace = agent.prepare_workspace(gpu_id)
        if settings.fake_agent:
            result = agent.fake_agent_session(
                task=task, workspace=workspace, hypothesis=hypothesis,
                cvd=cvd, on_log=on_log)
        else:
            result = await asyncio.wait_for(
                agent.run_agent_session(
                    task=task, workspace=workspace, hypothesis=hypothesis,
                    digest=_get_digest(client), cvd=cvd, on_log=on_log),
                timeout=settings.agent_timeout)
    except asyncio.TimeoutError:
        result = agent.AgentResult.failed("agent timed out")
    except Exception as exc:  # noqa: BLE001
        result = agent.AgentResult.failed(f"worker error: {exc}")
    finally:
        stop_hb.set()
    _report(client, idea_id, result, gpu_id, worker_id)


async def _handle_agent_idea(client: httpx.Client, worker_id: int,
                             claim: dict[str, Any]) -> None:
    idea = claim["idea"]
    idea_id = idea["id"]
    task_id = claim.get("task") or claim.get("task_id") or ""
    hypothesis = (idea.get("config") or {}).get("hypothesis", "")
    log_url = _endpoint(claim, "agent_log_url", "log_url")
    benchmark_url = _endpoint(
        claim, "benchmark_callback_url", "queued_benchmark_url", "benchmark_url")
    finalize_url = _endpoint(
        claim, "finalize_url", "finalization_url", "agent_finalize_url", "result_url")

    def on_log(line: str) -> None:
        payload = {"idea_id": idea_id, "agent_id": worker_id, "line": line}
        try:
            if log_url is not None:
                client.post(log_url, json=payload)
            else:
                client.post("/agent_log", json={**payload, "gpu_id": -1})
        except httpx.HTTPError:
            pass

    workspace = agent.prepare_agent_workspace(worker_id, idea_id)

    def benchmark_callback(method_path: str) -> dict[str, Any]:
        if benchmark_url is None:
            return {"status": "failed", "error": "no queued benchmark endpoint"}
        return _post_callback(
            client, benchmark_url,
            _method_payload(idea_id=idea_id, worker_id=worker_id, task_id=task_id,
                            workspace=workspace, result=None, phase="benchmark"))

    has_queued_finalizer = benchmark_url is not None or finalize_url is not None
    try:
        task = bench.load_task(task_id)
        if settings.fake_agent:
            result = agent.fake_agent_session(
                task=task, workspace=workspace, hypothesis=hypothesis,
                cvd=None, on_log=on_log, finalize=not has_queued_finalizer)
        else:
            result = await asyncio.wait_for(
                agent.run_agent_session(
                    task=task, workspace=workspace, hypothesis=hypothesis,
                    digest=_get_digest(client), cvd=None, on_log=on_log,
                    finalize=not has_queued_finalizer,
                    benchmark_callback=benchmark_callback if benchmark_url else None),
                timeout=settings.agent_timeout)
    except asyncio.TimeoutError:
        result = agent.AgentResult.failed("agent timed out")
    except Exception as exc:  # noqa: BLE001
        result = agent.AgentResult.failed(f"agent worker error: {exc}")

    if has_queued_finalizer:
        target = finalize_url or benchmark_url
        assert target is not None
        queued = _post_callback(
            client, target,
            _method_payload(idea_id=idea_id, worker_id=worker_id, task_id=task_id,
                            workspace=workspace, result=result, phase="finalize"))
        if queued.get("status") == "ok":
            return
        result = agent.AgentResult.failed(
            queued.get("error") or "queued benchmark callback failed",
            method_diff=result.method_diff, followup=result.followup)

    _report(client, idea_id, result, None, worker_id)


def run(worker_id: int, base_url: str) -> None:
    client = httpx.Client(base_url=base_url, timeout=30.0)
    _wait_for_api(client)

    IDLE_MIN, IDLE_MAX = 0.5, 5.0
    idle_sleep = IDLE_MIN

    while True:
        try:
            r = client.post("/claim_idea", json={"agent_id": worker_id}).json()
        except (httpx.HTTPError, json.JSONDecodeError):
            time.sleep(random.uniform(0.2, 0.6))
            continue

        if r.get("status") != "ok":
            if r.get("reason") in ("no_active_run", "budget"):
                idle_sleep = min(idle_sleep * 1.7, IDLE_MAX)
            else:
                idle_sleep = IDLE_MIN
            time.sleep(idle_sleep + random.uniform(0, 0.15))
            continue

        idle_sleep = IDLE_MIN
        try:
            asyncio.run(_handle_idea(client, worker_id, r["idea"],
                                     r.get("task", ""),
                                     r["gpu_id"], r["cuda_visible_devices"]))
        except Exception:  # noqa: BLE001 — _handle_idea reports internally
            pass


def run_agent(worker_id: int, base_url: str) -> None:
    client = httpx.Client(base_url=base_url, timeout=30.0)
    _wait_for_api(client)

    IDLE_MIN, IDLE_MAX = 0.5, 5.0
    idle_sleep = IDLE_MIN

    while True:
        try:
            r = client.post("/agent/claim_idea",
                            json={"agent_id": worker_id, "kind": "agent"}).json()
        except (httpx.HTTPError, json.JSONDecodeError):
            time.sleep(random.uniform(0.2, 0.6))
            continue

        if r.get("status") != "ok":
            if r.get("reason") in ("no_active_run", "budget", "not_found"):
                idle_sleep = min(idle_sleep * 1.7, IDLE_MAX)
            else:
                idle_sleep = IDLE_MIN
            time.sleep(idle_sleep + random.uniform(0, 0.15))
            continue

        idle_sleep = IDLE_MIN
        try:
            asyncio.run(_handle_agent_idea(client, worker_id, r))
        except Exception:  # noqa: BLE001 — _handle_agent_idea reports internally
            pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", type=int)
    ap.add_argument("--kind", choices=("coupled", "agent"), default="coupled")
    ap.add_argument("--base-url", default=settings.base_url)
    args = ap.parse_args()
    if args.id is None and args.kind == "coupled":
        ap.error("--id is required unless --kind agent is used")
    worker_id = args.id if args.id is not None else os.getpid()
    if args.kind == "agent":
        run_agent(worker_id, args.base_url)
    else:
        run(worker_id, args.base_url)


if __name__ == "__main__":
    main()
