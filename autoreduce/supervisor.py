"""Spawns and supervises the pool of worker subprocesses.

Each worker runs in its own session/process group so the whole group (worker +
its harness child) can be signalled together. The supervisor respawns a worker
that dies unexpectedly and tears the pool down cleanly on shutdown — SIGTERM,
grace, then SIGKILL — leaving no orphan worker or harness processes.
"""

from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import sys

WATCH_INTERVAL = 1.0
GRACE_SECONDS = 3.0


class Supervisor:
    def __init__(self, pool_size: int, base_url: str) -> None:
        self.pool_size = pool_size
        self.base_url = base_url
        self.procs: dict[int, subprocess.Popen] = {}
        self._shutting_down = False

    def _spawn(self, worker_id: int) -> subprocess.Popen:
        return subprocess.Popen(
            [sys.executable, "-m", "autoreduce.worker",
             "--id", str(worker_id), "--base-url", self.base_url],
            start_new_session=True,
        )

    def start(self) -> None:
        for i in range(self.pool_size):
            self.procs[i] = self._spawn(i)

    async def watch(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            if not self._shutting_down:
                for wid, proc in list(self.procs.items()):
                    if proc.poll() is not None:  # exited unexpectedly
                        self.procs[wid] = self._spawn(wid)
            try:
                await asyncio.wait_for(stop.wait(), timeout=WATCH_INTERVAL)
            except asyncio.TimeoutError:
                pass

    def terminate(self) -> None:
        self._shutting_down = True
        for proc in self.procs.values():
            _signal_group(proc, signal.SIGTERM)
        deadline = GRACE_SECONDS
        for proc in self.procs.values():
            try:
                proc.wait(timeout=deadline)
            except subprocess.TimeoutExpired:
                pass
            deadline = 0.1  # only the first wait gets the full grace window
        for proc in self.procs.values():
            if proc.poll() is None:
                _signal_group(proc, signal.SIGKILL)
        self.procs.clear()


def _signal_group(proc: subprocess.Popen, sig: int) -> None:
    if proc.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), sig)
    except (ProcessLookupError, PermissionError):
        try:
            proc.send_signal(sig)
        except ProcessLookupError:
            pass
