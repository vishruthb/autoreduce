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
import random
import threading
import time

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
            gpu_id: int, agent_id: int) -> None:
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", type=int, required=True)
    ap.add_argument("--base-url", default=settings.base_url)
    args = ap.parse_args()
    run(args.id, args.base_url)


if __name__ == "__main__":
    main()
