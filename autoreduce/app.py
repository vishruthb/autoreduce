"""FastAPI app + lifespan: brings up and tears down the whole control plane.

`python -m autoreduce` runs uvicorn against this single app. The lifespan owns
the database, the SSE broker, the planner + reaper tasks, and the 8 worker
subprocesses, and tears them all down cleanly on Ctrl-C (no orphan processes).
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import api, db, planner, reaper
from .config import settings
from .supervisor import Supervisor


class _QuietPolls(logging.Filter):
    """Drop access-log spam for the high-frequency internal poll endpoints."""

    NOISY = {"/claim_idea", "/heartbeat", "/agent_log"}

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and args[2] in self.NOISY:
            return False
        return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    # quiet the worker poll chatter (added after uvicorn configures its loggers)
    logging.getLogger("uvicorn.access").addFilter(_QuietPolls())

    db.setup(settings.db_path, settings.pool_size)
    # bind the single-writer lock to THIS event loop
    db.STATE_LOCK = asyncio.Lock()

    stop = asyncio.Event()
    sup = Supervisor(settings.pool_size, settings.base_url)
    sup.start()
    tasks = [
        asyncio.create_task(planner.planner_loop(stop)),
        asyncio.create_task(reaper.reaper_loop(stop)),
        asyncio.create_task(sup.watch(stop)),
    ]
    try:
        yield
    finally:
        stop.set()
        for task in tasks:
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                task.cancel()
        sup.terminate()
        db.close()


app = FastAPI(title="autoreduce", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api.router)
