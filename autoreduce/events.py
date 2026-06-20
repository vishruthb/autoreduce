"""In-process SSE broker: snapshot-on-change fan-out to subscribers.

All publishing happens on the control-plane event loop (workers never publish
directly — they POST to API endpoints, whose handlers publish). The read model
is a full snapshot per state change (the state is tiny and this is self-healing
on reconnect); agent log lines ride a separate, lighter ``log_append`` event.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from . import db, store


class Broker:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()
        self._seq = 0

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._subscribers.add(q)
        # prime with the current snapshot so a new client renders immediately
        self._enqueue(q, self._snapshot_event())
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def _snapshot_event(self) -> dict[str, Any]:
        self._seq += 1
        return {"type": "snapshot", "seq": self._seq, "data": store.snapshot(db.conn())}

    def current_snapshot(self) -> dict[str, Any]:
        """A fresh snapshot event (for GET /state)."""
        return self._snapshot_event()

    def publish_snapshot(self) -> None:
        event = self._snapshot_event()
        for q in list(self._subscribers):
            self._enqueue(q, event)

    def publish_log(self, *, idea_id: int, gpu_id: int, agent: str | None,
                    lines: list[str]) -> None:
        self._seq += 1
        event = {"type": "log_append", "seq": self._seq, "idea_id": idea_id,
                 "gpu_id": gpu_id, "agent": agent, "lines": lines}
        for q in list(self._subscribers):
            self._enqueue(q, event)

    @staticmethod
    def _enqueue(q: asyncio.Queue, event: dict[str, Any]) -> None:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            try:
                q.get_nowait()  # drop oldest, keep the stream live
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass


def format_sse(event: dict[str, Any]) -> str:
    # The whole event (type, seq, and payload) is the SSE data, so the client
    # reads `seq` uniformly across event types for stale-drop + reconnect.
    return (
        f"event: {event['type']}\n"
        f"id: {event['seq']}\n"
        f"data: {json.dumps(event)}\n\n"
    )


broker = Broker()
