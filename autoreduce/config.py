"""Runtime settings, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _load_dotenv(path: str = ".env") -> None:
    """Minimal .env loader (no dependency). Existing env vars win."""
    if not os.path.exists(path):
        return
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except OSError:
        pass


_load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Settings:
    host: str = os.environ.get("AUTOREDUCE_HOST", "127.0.0.1")
    port: int = _int("AUTOREDUCE_PORT", 8000)
    pool_size: int = _int("AUTOREDUCE_POOL_SIZE", 8)
    default_budget: int = _int("AUTOREDUCE_DEFAULT_BUDGET", 40)
    db_path: str = os.environ.get("AUTOREDUCE_DB", "autoreduce.db")
    seed: int = _int("AUTOREDUCE_SEED", 1234)
    model: str = os.environ.get("AUTOREDUCE_MODEL", "claude-opus-4-8")  # planner

    # sealed tasks (research domains) live OUTSIDE the package and are loaded from
    # this directory at runtime; the package itself ships zero domain code.
    tasks_dir: str = os.environ.get("AUTOREDUCE_TASKS_DIR", "examples")
    task: str | None = os.environ.get("AUTOREDUCE_TASK") or None  # else: first found

    # worker agents (Claude Agent SDK sessions)
    agent_model: str = os.environ.get("AUTOREDUCE_AGENT_MODEL", "claude-sonnet-4-6")
    agent_timeout: int = _int("AUTOREDUCE_AGENT_TIMEOUT", 180)   # per-idea wall-clock
    agent_max_turns: int = _int("AUTOREDUCE_AGENT_MAX_TURNS", 24)
    agent_max_budget_usd: float = float(
        os.environ.get("AUTOREDUCE_AGENT_MAX_BUDGET_USD", "0.50"))

    # optional: append every planner LLM call (digest in, hypotheses out) to this
    # JSONL file. Off by default → zero behavior change; instrumentation only.
    planner_log: str | None = os.environ.get("AUTOREDUCE_PLANNER_LOG") or None

    # timeouts (seconds)
    harness_timeout: int = _int("AUTOREDUCE_HARNESS_TIMEOUT", 60)
    heartbeat_timeout: int = _int("AUTOREDUCE_HEARTBEAT_TIMEOUT", 8)

    @property
    def fake_agent(self) -> bool:
        return os.environ.get("AUTOREDUCE_FAKE_AGENT", "") not in ("", "0", "false")

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def has_api_key(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY"))


settings = Settings()
