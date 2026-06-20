"""The general, sealed Task contract.

A Task is the system-owned definition of *one research domain*: the method
interface agents implement, the fixed workload + baseline, the measurement that
turns a method into a verified metric, and the prose/objective the planner and
agents are framed with. Spec-dec is the first Task; adding a new domain is a new
Task module under ``tasks/`` with **zero change to the core** (worker, agent,
planner, store). The core only ever knows "the active run's task".

Agents implement a method against ``interface_source``; they cannot modify the
Task — that is what keeps rewards verified.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


def result(*, metric: float | None, baseline: float | None, status: str,
           error: str | None, summary: str | None) -> dict[str, Any]:
    """The sealed result fields — defined here and nowhere else."""
    return {
        "metric": None if metric is None else round(metric, 4),
        "baseline": baseline,
        "status": status,        # "ok" | "failed"
        "error": error,
        "summary": summary,
    }


def failed(error: str) -> dict[str, Any]:
    return result(metric=None, baseline=None, status="failed", error=error,
                  summary=None)


class Task(ABC):
    """One sealed research domain. All attributes are system-owned constants."""

    id: str
    objective_name: str        # e.g. "speedup"
    direction: str             # "maximize" | "minimize"
    interface_name: str        # the ABC class the agent subclasses
    interface_import: str      # the exact import line the agent must use
    domain_blurb: str          # what the agent is optimizing, in one sentence

    @abstractmethod
    def interface_source(self) -> str:
        """The sealed interface module text, handed to the agent inline."""

    @abstractmethod
    def run(self, method_path: str) -> dict[str, Any]:
        """Measure the method at ``method_path`` → the sealed result dict.

        THE ONE SWAP POINT per domain (a stub now; real benchmark later). Must
        never raise: a broken method returns ``status="failed"``."""

    @abstractmethod
    def sample_method(self, *, broken: bool) -> str:
        """A reference method source — used by the key-free fake agent and tests."""
