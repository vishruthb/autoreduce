"""The spec-dec method interface (sealed; agents may read, not modify).

Agents write `method.py` defining `class Strategy(SpeculationStrategy)` and
import this with:

    from specdec import SpeculationStrategy
"""

from __future__ import annotations

from abc import ABC, abstractmethod

VOCAB_SIZE = 32      # token id space is range(VOCAB_SIZE)
MAX_DRAFT = 5        # the benchmark always calls propose with k = MAX_DRAFT


class SpeculationStrategy(ABC):
    """A speculative-decoding draft strategy.

    Implementations propose draft tokens to verify in parallel. The benchmark
    accepts the longest correct prefix of each proposal, so accurate, right-sized
    proposals win; over-proposing wastes draft compute and is penalized.
    """

    name: str = "unnamed"

    @abstractmethod
    def propose(self, context: list[int], k: int) -> list[int]:
        """Given the generated context tokens, propose up to ``k`` draft tokens
        for the *next* positions (token ids in ``range(VOCAB_SIZE)``)."""
        raise NotImplementedError
