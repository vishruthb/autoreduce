"""The sealed no-speculation baseline: one token per target call → 1.0."""

from __future__ import annotations


def baseline_tps() -> float:
    return 1.0
