"""Lightweight decoupled-mode scheduler loops."""

from __future__ import annotations

import asyncio

from . import db, store
from .config import settings
from .supervisor import Supervisor

SCHEDULER_INTERVAL = 2.0


async def agent_autoscaler_loop(stop: asyncio.Event, supervisor: Supervisor) -> None:
    if settings.scheduler_mode != "decoupled" or not settings.agent_autoscale:
        return
    while not stop.is_set():
        try:
            async with db.STATE_LOCK:
                run = store.active_run(db.conn())
                state = store.resource_state(
                    db.conn(), run["id"] if run is not None else None)
            target = state["agent_stats"]["target_agents"]
            if isinstance(target, int):
                supervisor.scale_agents(target)
        except Exception:  # noqa: BLE001 - autoscaling should never kill the app
            pass
        try:
            await asyncio.wait_for(stop.wait(), timeout=SCHEDULER_INTERVAL)
        except asyncio.TimeoutError:
            pass
