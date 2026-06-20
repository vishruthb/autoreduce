"""CLI: ``python -m autoreduce.bench <task_id> <method.py>`` → one JSON line.

The worker's system-owned `run_benchmark` tool invokes this as a subprocess, so
the agent's method runs isolated and the metric is computed by sealed code the
agent cannot reach at runtime. The task is loaded from the external tasks dir.
"""

from __future__ import annotations

import json
import sys

from .loader import load_task
from .task import failed


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps(failed("usage: python -m autoreduce.bench <task_id> <method.py>")))
        return 2
    task_id, method_path = sys.argv[1], sys.argv[2]
    try:
        task = load_task(task_id)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps(failed(f"could not load task {task_id!r}: {exc}")))
        return 2
    print(json.dumps(task.run(method_path)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
