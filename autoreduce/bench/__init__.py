"""The SEALED, system-owned measurement framework — and NOTHING domain-specific.

A `Task` (see `task.py`) defines a research domain: interface, workload,
baseline, and measurement. Tasks live OUTSIDE this package and are loaded from a
directory at runtime (`loader.py`); the package ships zero domains. Agents
implement a method against a task's interface; the system measures it. Each
task's `run()` is the ONE swap point for its real benchmark.
"""

from .loader import list_tasks, load_task, resolve_default
from .task import Task, failed, result

__all__ = ["Task", "result", "failed", "load_task", "list_tasks", "resolve_default"]
