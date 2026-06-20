"""Decoupled benchmark worker for pre-written experiment methods.

`python -m autoreduce.benchmark_worker --id N --base-url http://127.0.0.1:8000`

This worker is intentionally separate from ``autoreduce.worker``. It does not
claim ideas, launch an agent session, prepare a workspace, or write methods.
It only claims a benchmarkable experiment over HTTP, runs the system-owned
sealed benchmark for the claimed method, and reports the sealed result.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import time
from dataclasses import dataclass
from typing import Any

import httpx

from . import agent
from .config import settings


@dataclass(frozen=True)
class ExperimentClaim:
    experiment_id: int | str
    idea_id: int | str | None
    task_id: str
    method_path: str
    workspace: str | None
    gpu_ids: list[int | str] | None
    cuda_visible_devices: str | None
    raw: dict[str, Any]


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


def _cuda_visible_devices(body: dict[str, Any]) -> str | None:
    cvd = body.get("cuda_visible_devices")
    if cvd is not None:
        return str(cvd)
    gpu_ids = body.get("gpu_ids")
    if isinstance(gpu_ids, list) and gpu_ids:
        return ",".join(str(gpu_id) for gpu_id in gpu_ids)
    gpu_id = body.get("gpu_id")
    if gpu_id is not None:
        return str(gpu_id)
    return None


def _resolve_method_path(body: dict[str, Any]) -> str:
    method_path = body.get("method_path")
    workspace = body.get("workspace")
    if not isinstance(method_path, str) or not method_path:
        raise ValueError("claim did not include method_path")
    if os.path.isabs(method_path) or not workspace:
        return method_path
    if not isinstance(workspace, str):
        raise ValueError("claim workspace must be a string when method_path is relative")
    return os.path.join(workspace, method_path)


def _parse_claim(body: dict[str, Any]) -> ExperimentClaim | None:
    if body.get("status") not in (None, "ok"):
        return None

    experiment_id = body.get("experiment_id", body.get("id"))
    if experiment_id is None:
        raise ValueError("claim did not include experiment_id or id")

    task_id = body.get("task_id", body.get("task"))
    if not isinstance(task_id, str) or not task_id:
        raise ValueError("claim did not include task_id")

    gpu_ids = body.get("gpu_ids")
    if gpu_ids is not None and not isinstance(gpu_ids, list):
        gpu_ids = [gpu_ids]

    workspace = body.get("workspace")
    if workspace is not None and not isinstance(workspace, str):
        raise ValueError("claim workspace must be a string")

    return ExperimentClaim(
        experiment_id=experiment_id,
        idea_id=body.get("idea_id"),
        task_id=task_id,
        method_path=_resolve_method_path(body),
        workspace=workspace,
        gpu_ids=gpu_ids,
        cuda_visible_devices=_cuda_visible_devices(body),
        raw=body,
    )


def claim_experiment(client: httpx.Client, worker_id: int) -> ExperimentClaim | None:
    response = client.post("/experiments/claim", json={"worker_id": worker_id})
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, dict):
        raise ValueError("claim response must be a JSON object")
    return _parse_claim(body)


def _report_payload(worker_id: int, claim: ExperimentClaim,
                    bench_result: dict[str, Any]) -> dict[str, Any]:
    status = "done" if bench_result.get("status") == "ok" else "failed"
    payload = {
        "experiment_id": claim.experiment_id,
        "idea_id": claim.idea_id,
        "task_id": claim.task_id,
        "worker_id": worker_id,
        "method_path": claim.method_path,
        "workspace": claim.workspace,
        "gpu_ids": claim.gpu_ids,
        "cuda_visible_devices": claim.cuda_visible_devices,
        "metric": bench_result.get("metric"),
        "baseline": bench_result.get("baseline"),
        "status": status,
        "error": bench_result.get("error"),
        "summary": bench_result.get("summary"),
        "benchmark": bench_result,
    }
    return {key: value for key, value in payload.items() if value is not None}


def _simulated_scale_result(claim: ExperimentClaim,
                            bench_result: dict[str, Any]) -> dict[str, Any]:
    if not settings.simulate_scale_metrics or bench_result.get("status") != "ok":
        return bench_result
    metric = bench_result.get("metric")
    if not isinstance(metric, (int, float)):
        return bench_result
    resource = claim.raw.get("resource_shape")
    gpu_count = 1
    if isinstance(resource, dict):
        try:
            gpu_count = int(resource.get("gpu_count") or 1)
        except (TypeError, ValueError):
            gpu_count = 1
    if gpu_count <= 1:
        return bench_result
    multiplier = {2: 1.13, 4: 1.26, 8: 1.27}.get(gpu_count, 1.0)
    out = dict(bench_result)
    out["metric"] = round(metric * multiplier, 4)
    summary = out.get("summary") or "sealed benchmark"
    out["summary"] = f"{summary}; simulated {gpu_count}xH100 scale probe"
    return out


def report_experiment(client: httpx.Client, worker_id: int, claim: ExperimentClaim,
                      bench_result: dict[str, Any]) -> None:
    payload = _report_payload(worker_id, claim, bench_result)
    last_error: Exception | None = None
    for _ in range(5):
        try:
            response = client.post(
                f"/experiments/{claim.experiment_id}/report",
                json=payload,
            )
            response.raise_for_status()
            return
        except httpx.HTTPError as exc:
            last_error = exc
            time.sleep(0.3)
    if last_error is not None:
        raise last_error


def handle_once(client: httpx.Client, worker_id: int) -> bool:
    claim = claim_experiment(client, worker_id)
    if claim is None:
        return False
    bench_result = agent._run_sealed_bench(
        claim.method_path,
        claim.cuda_visible_devices,
        claim.task_id,
    )
    bench_result = _simulated_scale_result(claim, bench_result)
    report_experiment(client, worker_id, claim, bench_result)
    return True


def run(worker_id: int, base_url: str, *, wait_for_api: bool = True) -> None:
    client = httpx.Client(base_url=base_url, timeout=30.0)
    if wait_for_api:
        _wait_for_api(client)

    idle_min, idle_max = 0.5, 5.0
    idle_sleep = idle_min

    while True:
        try:
            did_work = handle_once(client, worker_id)
        except (httpx.HTTPError, json.JSONDecodeError, ValueError):
            time.sleep(random.uniform(0.2, 0.6))
            continue

        if did_work:
            idle_sleep = idle_min
            continue

        idle_sleep = min(idle_sleep * 1.7, idle_max)
        time.sleep(idle_sleep + random.uniform(0, 0.15))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", type=int, required=True)
    ap.add_argument("--base-url", default=settings.base_url)
    ap.add_argument("--no-wait-health", action="store_true",
                    help="start polling /experiments/claim without probing /health")
    args = ap.parse_args()
    run(args.id, args.base_url, wait_for_api=not args.no_wait_health)


if __name__ == "__main__":
    main()
