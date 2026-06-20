"""SQLite connection, schema, pragmas, and the single-writer lock.

The control plane is the SOLE writer of this database. Workers never touch it —
they go through the HTTP tool endpoints. Within the control-plane process every
mutation runs on the event loop under ``STATE_LOCK`` (an asyncio.Lock), so the
write path is single-threaded. ``BEGIN IMMEDIATE`` + conditional UPDATEs provide
belt-and-suspenders atomicity that holds even across separate connections (which
is exercised by the key-free concurrency test).
"""

from __future__ import annotations

import asyncio
import sqlite3

# Serializes every multi-statement transaction in the control plane. Real job:
# guarantee mutual exclusion even if a future edit introduces an `await` inside a
# transaction. Created at import; binds to the running loop on first `await`.
STATE_LOCK = asyncio.Lock()

_PRAGMAS = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA synchronous=NORMAL",
    "PRAGMA foreign_keys=ON",
    "PRAGMA busy_timeout=5000",
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at     REAL NOT NULL,
    prompt         TEXT NOT NULL,
    objective_name TEXT,
    direction      TEXT NOT NULL DEFAULT 'maximize',  -- maximize | minimize
    schema_json    TEXT,                               -- frozen idea JSON Schema (NULL until derived)
    budget_total   INTEGER NOT NULL,                   -- unit = completed experiments
    state          TEXT NOT NULL DEFAULT 'pending',    -- pending | running | draining | done | failed
    model          TEXT,
    seed           INTEGER NOT NULL,
    error          TEXT,
    task_id        TEXT NOT NULL,                    -- the sealed task this run targets
    -- planner status (single source of truth, survives reconnects)
    planner_status    TEXT DEFAULT 'idle',  -- idle | designing | seeding | thinking | waiting | done
    latest_reasoning  TEXT,
    exploring_region  TEXT
);

CREATE TABLE IF NOT EXISTS gpu_slots (
    gpu_id       INTEGER PRIMARY KEY,
    status       TEXT NOT NULL DEFAULT 'free',  -- free | busy
    agent_id     INTEGER,
    idea_id      INTEGER,
    lease_id     INTEGER,
    claimed_at   REAL,
    heartbeat_at REAL
);

CREATE TABLE IF NOT EXISTS ideas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER NOT NULL REFERENCES runs(id),
    config_json TEXT NOT NULL,                  -- canonical JSON (sort_keys, compact)
    config_hash TEXT NOT NULL,                  -- sha256 of config_json
    status      TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed
    origin      TEXT NOT NULL,                  -- seed | exploit | explore
    rationale   TEXT,
    metric      REAL,
    error       TEXT,
    created_at  REAL NOT NULL,
    claimed_at  REAL,
    finished_at REAL,
    gpu_id      INTEGER,
    agent_id    INTEGER,
    attempts    INTEGER NOT NULL DEFAULT 0,
    -- agentic idea-search result fields (the agent writes a method; the system
    -- writes the metric/baseline; method_diff/followup are agent-authored text)
    method_diff     TEXT,
    followup        TEXT,
    baseline_metric REAL
);

CREATE INDEX IF NOT EXISTS idx_ideas_status_id ON ideas(status, id);
CREATE INDEX IF NOT EXISTS idx_ideas_run_metric ON ideas(run_id, metric);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ideas_hash ON ideas(config_hash);

CREATE TABLE IF NOT EXISTS experiments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              INTEGER NOT NULL REFERENCES runs(id),
    idea_id             INTEGER NOT NULL REFERENCES ideas(id),
    status              TEXT NOT NULL DEFAULT 'queued',
    phase               TEXT NOT NULL DEFAULT 'default',
    priority            INTEGER NOT NULL DEFAULT 0,
    resource_shape_json TEXT NOT NULL,
    workload_shape_json TEXT NOT NULL,
    workspace           TEXT,
    method_path         TEXT,
    metric              REAL,
    baseline_metric     REAL,
    error               TEXT,
    method_diff         TEXT,
    followup            TEXT,
    created_at          REAL NOT NULL,
    claimed_at          REAL,
    finished_at         REAL,
    agent_id            INTEGER,
    lease_id            INTEGER,
    attempts            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_leases (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id     INTEGER NOT NULL,
    idea_id      INTEGER,
    status       TEXT NOT NULL DEFAULT 'busy',
    claimed_at   REAL,
    heartbeat_at REAL
);

CREATE TABLE IF NOT EXISTS gpu_leases (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL REFERENCES experiments(id),
    gpu_count     INTEGER NOT NULL,
    gpu_ids_json  TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'busy',
    claimed_at    REAL,
    heartbeat_at  REAL
);

CREATE INDEX IF NOT EXISTS idx_experiments_status_priority
    ON experiments(status, priority, id);
CREATE INDEX IF NOT EXISTS idx_experiments_idea ON experiments(idea_id);
CREATE INDEX IF NOT EXISTS idx_agent_leases_status ON agent_leases(status);
CREATE INDEX IF NOT EXISTS idx_gpu_leases_status ON gpu_leases(status);
"""


def connect(path: str) -> sqlite3.Connection:
    """Open a connection with the standard pragmas and row access by name."""
    conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    for pragma in _PRAGMAS:
        conn.execute(pragma)
    return conn


# columns added after the initial release; brought in on existing DBs by _migrate
_MIGRATIONS = {
    "ideas": {"method_diff": "TEXT", "followup": "TEXT", "baseline_metric": "REAL"},
    "gpu_slots": {"lease_id": "INTEGER"},
    "runs": {"task_id": "TEXT NOT NULL DEFAULT ''"},  # '' for legacy rows only
}


def _migrate(conn: sqlite3.Connection) -> None:
    for table, cols in _MIGRATIONS.items():
        have = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        for col, decl in cols.items():
            if col not in have:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)
    _migrate(conn)


def seed_slots(conn: sqlite3.Connection, pool_size: int) -> None:
    """Insert gpu_slots 0..pool_size-1 if they do not already exist."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        for gpu_id in range(pool_size):
            conn.execute(
                "INSERT OR IGNORE INTO gpu_slots(gpu_id, status) VALUES (?, 'free')",
                (gpu_id,),
            )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


# --- App-wide shared connection (control plane only) -----------------------

_app_conn: sqlite3.Connection | None = None


def setup(path: str, pool_size: int) -> sqlite3.Connection:
    """Open the control plane's single shared connection and build the schema."""
    global _app_conn
    _app_conn = connect(path)
    init_schema(_app_conn)
    seed_slots(_app_conn, pool_size)
    return _app_conn


def conn() -> sqlite3.Connection:
    if _app_conn is None:
        raise RuntimeError("db.setup() has not been called")
    return _app_conn


def close() -> None:
    global _app_conn
    if _app_conn is not None:
        _app_conn.close()
        _app_conn = None
