"""THE SEAM — stub harness.

Contract (do not change): ``python harness.py config.json`` reads a config JSON,
honours ``CUDA_VISIBLE_DEVICES`` from the environment, does a short unit of
"work", and prints exactly one JSON line to stdout whose required field is a
numeric ``metric``. The real vLLM / spec-dec harness swaps in behind this exact
CLI + stdout contract; nothing else in the system changes.

The stub's metric is a smooth, scale-free synthetic landscape: each numeric
config parameter contributes a Gaussian bump centred on a deterministic target,
so configs near the current best reliably score higher — exploitation visibly
climbs the ranked table. Noise is seeded by the config itself, so the same
config yields the same metric (reproducible) while different configs differ.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import random
import sys
import time


def _hash_unit(*parts: str) -> float:
    """Deterministic float in [0, 1) from the given string parts."""
    h = hashlib.sha256("|".join(parts).encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big") / 2**64


def _squash(v: float) -> float:
    """Map any real value to (-1, 1), monotonic and scale-free."""
    return v / (1.0 + abs(v))


def compute_metric(config: dict, seed: int) -> float:
    sd = str(seed)
    score = 0.0
    n_terms = 0
    sigma = 0.35
    for key in sorted(config):
        val = config[key]
        if isinstance(val, bool):
            # treat booleans as a per-key preference
            pref = _hash_unit(sd, key, "bool") > 0.5
            score += 1.0 if bool(val) == pref else 0.0
            n_terms += 1
        elif isinstance(val, (int, float)):
            target = -0.8 + 1.6 * _hash_unit(sd, key, "target")  # in (-0.8, 0.8)
            u = _squash(float(val))
            score += math.exp(-((u - target) ** 2) / (2 * sigma**2))
            n_terms += 1
        elif isinstance(val, str):
            score += _hash_unit(sd, key, "enum", val)
            n_terms += 1
    base = (score / n_terms) if n_terms else 0.0  # in ~[0, 1]

    # small reproducible noise keyed by the exact config
    cj = json.dumps(config, sort_keys=True, separators=(",", ":"))
    rng = random.Random(hashlib.sha256((cj + sd).encode()).hexdigest())
    noise = rng.gauss(0.0, 0.01)
    return round(max(0.0, 100.0 * base + 100.0 * noise), 4)


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"metric": None, "status": "error",
                          "error": "usage: harness.py config.json"}))
        return 2
    seed = int(os.environ.get("AUTOREDUCE_SEED", "0") or "0")
    with open(sys.argv[1]) as fh:
        config = json.load(fh)

    start = time.time()
    # simulate a short unit of GPU work so parallelism is visible in the UI
    rng = random.Random(json.dumps(config, sort_keys=True))
    time.sleep(rng.uniform(0.2, 0.6))
    metric = compute_metric(config, seed)
    elapsed = round(time.time() - start, 3)

    print(json.dumps({
        "metric": metric,
        "status": "ok",
        "gpu": os.environ.get("CUDA_VISIBLE_DEVICES"),
        "seconds": elapsed,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
