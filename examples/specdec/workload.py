"""The FIXED spec-dec workload (sealed, deterministic, no GPU)."""

from __future__ import annotations

import random

from .interface import VOCAB_SIZE

SEED = 20260620
LENGTH = 2400
DRAFT_COST = 0.12   # a draft token is cheaper than a target verification


def _make_sequence() -> list[int]:
    rng = random.Random(SEED)
    motifs = [[rng.randrange(VOCAB_SIZE) for _ in range(rng.randint(4, 9))]
              for _ in range(8)]
    seq: list[int] = []
    while len(seq) < LENGTH:
        if rng.random() < 0.82:
            seq.extend(rng.choice(motifs))
        else:
            seq.append(rng.randrange(VOCAB_SIZE))
    return seq[:LENGTH]


SEQUENCE: list[int] = _make_sequence()
