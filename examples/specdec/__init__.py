"""The spec-dec Task — an EXTERNAL example domain (not part of the autoreduce
package). autoreduce loads it from its tasks directory at runtime; nothing in
the core depends on it.

Re-exports `SpeculationStrategy` so agents import it as
`from specdec import SpeculationStrategy`, and defines `TASK`, which autoreduce
discovers by attribute name.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from autoreduce.bench import Task

from . import benchmark, samples
from .interface import MAX_DRAFT, VOCAB_SIZE, SpeculationStrategy

__all__ = ["SpeculationStrategy", "MAX_DRAFT", "VOCAB_SIZE", "TASK"]


class SpecDecTask(Task):
    id = "specdec"
    objective_name = "speedup"
    direction = "maximize"
    interface_name = "SpeculationStrategy"
    interface_import = "from specdec import SpeculationStrategy"
    allowed_gpu_counts = (1, 2, 4, 8)
    default_resource_shape = {"gpu_count": 1}
    scale_axes = ("gpu_count", "batch_size", "concurrency", "draft_length")
    scale_sensitive = True
    domain_blurb = (
        "Speculative decoding: a small draft strategy proposes the next tokens "
        "for a large target model to verify in parallel; the target accepts the "
        "longest correct prefix. Higher accepted-tokens-per-call throughput vs "
        "the no-speculation baseline (1.0) is better — but proposing tokens has a "
        "cost, so over-proposing is penalized."
    )

    def interface_source(self) -> str:
        return (Path(__file__).parent / "interface.py").read_text()

    def run(self, method_path: str) -> dict[str, Any]:
        return benchmark.run(method_path)

    def sample_method(self, *, broken: bool) -> str:
        return samples.BROKEN if broken else samples.GOOD


TASK = SpecDecTask()
