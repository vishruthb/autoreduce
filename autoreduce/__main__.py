"""`python -m autoreduce` — launch the control plane (API + planner + pool)."""

from __future__ import annotations

import uvicorn

from .config import settings


def main() -> None:
    uvicorn.run(
        "autoreduce.app:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
