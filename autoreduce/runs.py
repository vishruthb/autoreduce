"""Run lifecycle glue: dedup insertion of proposed ideas.

Sits between the planner (which proposes hypothesis dicts) and the store (which
persists queued ideas).
"""

from __future__ import annotations

import sqlite3
from typing import Any

from . import store


_VALID_ORIGINS = ("seed", "exploit", "explore")


def insert_hypotheses(
    conn: sqlite3.Connection,
    *,
    run_id: int,
    hypotheses: list[dict[str, Any]],
) -> tuple[int, list[str]]:
    """Insert queued research ideas (NL hypotheses targeting the run's task).

    There is no schema to validate against — an idea is a non-empty hypothesis
    string; dedup is by the store's config_hash on the canonical payload. The
    interface/domain live on the run's task, not on the idea. Returns
    (n_inserted, error_strings).
    """
    inserted = 0
    errors: list[str] = []
    for item in hypotheses:
        text = (item.get("hypothesis") or "").strip()
        if not text:
            errors.append("empty hypothesis")
            continue
        origin = item.get("origin") if item.get("origin") in _VALID_ORIGINS else "explore"
        if store.insert_idea(conn, run_id=run_id, config={"hypothesis": text},
                             origin=origin, rationale=item.get("rationale")):
            inserted += 1
    return inserted, errors
