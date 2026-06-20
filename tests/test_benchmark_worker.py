from __future__ import annotations

import json

import httpx

from autoreduce import benchmark_worker


def test_parse_claim_resolves_workspace_method_and_gpu_ids():
    claim = benchmark_worker._parse_claim(
        {
            "id": "exp-7",
            "idea_id": 12,
            "task_id": "specdec",
            "workspace": "/tmp/work",
            "method_path": "method.py",
            "gpu_ids": [2, 3],
        }
    )

    assert claim is not None
    assert claim.experiment_id == "exp-7"
    assert claim.idea_id == 12
    assert claim.task_id == "specdec"
    assert claim.method_path == "/tmp/work/method.py"
    assert claim.cuda_visible_devices == "2,3"


def test_parse_claim_idle_status_returns_none():
    assert benchmark_worker._parse_claim({"status": "empty"}) is None


def test_handle_once_runs_sealed_benchmark_and_reports(monkeypatch):
    requests: list[tuple[str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode() or "{}")
        requests.append((str(request.url.path), body))
        if request.url.path == "/experiments/claim":
            return httpx.Response(
                200,
                json={
                    "status": "ok",
                    "experiment_id": 99,
                    "idea_id": 42,
                    "task_id": "specdec",
                    "workspace": "/workspace",
                    "method_path": "candidate.py",
                    "cuda_visible_devices": "7",
                },
            )
        if request.url.path == "/experiments/99/report":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    seen_bench_args: list[tuple[str, str | None, str]] = []

    def fake_bench(method_path: str, cvd: str | None, task_id: str):
        seen_bench_args.append((method_path, cvd, task_id))
        return {
            "status": "ok",
            "metric": 1.25,
            "baseline": 1.0,
            "error": None,
            "summary": "faster",
        }

    monkeypatch.setattr(benchmark_worker.agent, "_run_sealed_bench", fake_bench)
    client = httpx.Client(
        base_url="http://testserver",
        transport=httpx.MockTransport(handler),
    )

    assert benchmark_worker.handle_once(client, worker_id=5) is True

    assert seen_bench_args == [("/workspace/candidate.py", "7", "specdec")]
    assert requests[0] == ("/experiments/claim", {"worker_id": 5})

    report_path, report_body = requests[1]
    assert report_path == "/experiments/99/report"
    assert report_body["experiment_id"] == 99
    assert report_body["idea_id"] == 42
    assert report_body["worker_id"] == 5
    assert report_body["metric"] == 1.25
    assert report_body["status"] == "done"
    assert report_body["benchmark"]["summary"] == "faster"
