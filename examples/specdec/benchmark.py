"""The sealed spec-dec measurement — the ONE swap point for this task.

STUB: imports the agent's method, runs its ``SpeculationStrategy`` on the fixed
workload, and scores synthetic speculative-decoding throughput vs the baseline
(no GPU). The real vLLM/spec-dec benchmark replaces ``run``'s body behind this
signature. A broken method fails here, never crashes.
"""

from __future__ import annotations

import importlib.util
import traceback
from typing import Any

from autoreduce.bench import failed, result

from . import baseline, workload
from .interface import MAX_DRAFT, VOCAB_SIZE, SpeculationStrategy


def _load_strategy(method_path: str) -> SpeculationStrategy:
    spec = importlib.util.spec_from_file_location("agent_method", method_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load module from {method_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    candidate = getattr(module, "Strategy", None)
    if not (isinstance(candidate, type) and issubclass(candidate, SpeculationStrategy)):
        candidate = next(
            (obj for obj in vars(module).values()
             if isinstance(obj, type) and issubclass(obj, SpeculationStrategy)
             and obj is not SpeculationStrategy),
            None,
        )
    if candidate is None:
        raise TypeError("no SpeculationStrategy subclass found (define `class Strategy`)")
    return candidate()  # type: ignore[abstract]


def _measure(strat: SpeculationStrategy) -> tuple[float, str]:
    seq = workload.SEQUENCE
    k = MAX_DRAFT
    draft_cost = workload.DRAFT_COST

    pos = total_tokens = target_calls = draft_tokens = accepted_sum = guard = 0
    limit = len(seq) + 16

    while pos + 1 < len(seq):
        guard += 1
        if guard > limit:
            break
        context = seq[: pos + 1]
        proposed = strat.propose(list(context), k)
        try:
            proposed = [int(t) % VOCAB_SIZE for t in list(proposed)[:k]]
        except (TypeError, ValueError):
            proposed = []

        accepted = 0
        for j, tok in enumerate(proposed):
            if pos + 1 + j < len(seq) and tok == seq[pos + 1 + j]:
                accepted += 1
            else:
                break

        generated = accepted + 1
        total_tokens += generated
        target_calls += 1
        draft_tokens += len(proposed)
        accepted_sum += accepted
        pos += generated

    wall = target_calls + draft_cost * draft_tokens
    tps = (total_tokens / wall) if wall > 0 else 0.0
    avg_accept = (accepted_sum / target_calls) if target_calls else 0.0
    summary = (f"accepted {avg_accept:.2f}/{k} avg over {target_calls} steps "
               f"→ {tps:.2f} tokens/call ({tps:.2f}× baseline)")
    return tps, summary


def run(method_path: str) -> dict[str, Any]:
    try:
        strat = _load_strategy(method_path)
    except Exception as exc:  # noqa: BLE001 — a bad method is data, not a crash
        return failed(f"load error: {exc}")
    try:
        metric, summary = _measure(strat)
    except Exception:  # noqa: BLE001
        return failed("method crashed during measurement:\n"
                      + traceback.format_exc(limit=4))
    return result(metric=metric, baseline=baseline.baseline_tps(), status="ok",
                  error=None, summary=summary)
