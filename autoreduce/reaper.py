"""Reaper loop: free GPU slots whose worker died or whose harness wedged."""

from __future__ import annotations

import asyncio

from . import events, store
from .config import settings

REAP_INTERVAL = 2.0


async def reaper_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            # Heartbeats are the primary liveness signal (a dead worker stops
            # pinging). The wall-clock cap must exceed an agent's per-idea budget
            # so a healthy long session isn't reaped mid-run.
            freed = await store.reaper_pass(
                settings.heartbeat_timeout, settings.agent_timeout + 30
            )
            if freed:
                events.broker.publish_snapshot()
        except Exception:  # noqa: BLE001 — never let the reaper die
            pass
        try:
            await asyncio.wait_for(stop.wait(), timeout=REAP_INTERVAL)
        except asyncio.TimeoutError:
            pass
