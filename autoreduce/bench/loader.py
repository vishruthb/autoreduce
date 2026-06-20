"""Load sealed Tasks from an EXTERNAL directory at runtime.

The autoreduce package ships zero research domains. Tasks live under a tasks
directory (default ``./examples``, set by ``AUTOREDUCE_TASKS_DIR``); each is a
Python package whose folder name is the task id (e.g. ``examples/specdec`` →
task ``"specdec"``) and which exposes a ``TASK`` object (an ``autoreduce.bench.
Task``). The directory is put on ``sys.path`` so the task — and the agent's
``method.py`` that imports its interface — resolve as a top-level package.
"""

from __future__ import annotations

import importlib
import os
import sys

from .task import Task

_cache: dict[tuple[str, str], Task] = {}


def _resolve_dir(tasks_dir: str | None) -> str:
    if tasks_dir is None:
        from ..config import settings
        tasks_dir = settings.tasks_dir
    d = os.path.abspath(tasks_dir)
    if d not in sys.path:
        sys.path.insert(0, d)  # so the task + the agent's method.py resolve it
    return d


def list_tasks(tasks_dir: str | None = None) -> list[str]:
    d = _resolve_dir(tasks_dir)
    if not os.path.isdir(d):
        return []
    return sorted(
        name for name in os.listdir(d)
        if os.path.isfile(os.path.join(d, name, "__init__.py"))
    )


def load_task(name: str, tasks_dir: str | None = None) -> Task:
    d = _resolve_dir(tasks_dir)
    key = (d, name)
    if key in _cache:
        return _cache[key]
    module = importlib.import_module(name)
    task = getattr(module, "TASK", None)
    if not isinstance(task, Task):
        raise TypeError(f"task {name!r} does not expose a TASK: Task")
    _cache[key] = task
    return task


def resolve_default(explicit: str | None = None, tasks_dir: str | None = None) -> str:
    """The task id a new run uses: explicit > AUTOREDUCE_TASK > the first found."""
    if explicit:
        return explicit
    from ..config import settings
    if settings.task:
        return settings.task
    tasks = list_tasks(tasks_dir)
    if not tasks:
        raise RuntimeError(
            f"no tasks found in {settings.tasks_dir!r} "
            "(set AUTOREDUCE_TASKS_DIR or add a task package)")
    return tasks[0]
