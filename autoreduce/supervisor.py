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
    def __init__(
        self,
        pool_size: int,
        base_url: str,
        *,
        mode: str = "coupled",
        agent_pool_size: int | None = None,
        agent_autoscale: bool = False,
    ) -> None:
        self.pool_size = pool_size
        self.base_url = base_url
        self.mode = mode
        self.agent_pool_size = agent_pool_size or pool_size
        self.agent_autoscale = agent_autoscale
        self.procs: dict[str, subprocess.Popen] = {}
        self._shutting_down = False

    def _spawn_coupled(self, worker_id: int) -> subprocess.Popen:
        return subprocess.Popen(
            [sys.executable, "-m", "autoreduce.worker",
             "--id", str(worker_id), "--base-url", self.base_url],
            start_new_session=True,
        )

    def _spawn_agent(self, worker_id: int) -> subprocess.Popen:
        return subprocess.Popen(
            [sys.executable, "-m", "autoreduce.worker", "--kind", "agent",
             "--id", str(worker_id), "--base-url", self.base_url],
            start_new_session=True,
        )

    def _spawn_benchmark(self, worker_id: int) -> subprocess.Popen:
        return subprocess.Popen(
            [sys.executable, "-m", "autoreduce.benchmark_worker",
             "--id", str(worker_id), "--base-url", self.base_url],
            start_new_session=True,
        )

    def _spawn_key(self, key: str) -> subprocess.Popen:
        kind, raw_id = key.split(":", 1)
        worker_id = int(raw_id)
        if kind == "agent":
            return self._spawn_agent(worker_id)
        if kind == "bench":
            return self._spawn_benchmark(worker_id)
        return self._spawn_coupled(worker_id)

    def start(self) -> None:
        if self.mode == "decoupled":
            initial_agents = self.pool_size if self.agent_autoscale else self.agent_pool_size
            for i in range(min(initial_agents, self.agent_pool_size)):
                self.procs[f"agent:{i}"] = self._spawn_agent(i)
            for i in range(self.pool_size):
                self.procs[f"bench:{i}"] = self._spawn_benchmark(i)
            return
        for i in range(self.pool_size):
            self.procs[f"coupled:{i}"] = self._spawn_coupled(i)

    async def watch(self, stop: asyncio.Event) -> None:
        while not stop.is_set():
            if not self._shutting_down:
                for key, proc in list(self.procs.items()):
                    if proc.poll() is not None:  # exited unexpectedly
                        self.procs[key] = self._spawn_key(key)
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

    def scale_agents(self, target: int) -> None:
        if self.mode != "decoupled" or self._shutting_down:
            return
        target = max(1, min(target, self.agent_pool_size))
        active = sorted(
            int(key.split(":", 1)[1])
            for key, proc in self.procs.items()
            if key.startswith("agent:") and proc.poll() is None
        )
        active_set = set(active)
        if len(active) < target:
            for worker_id in range(self.agent_pool_size):
                if len(active_set) >= target:
                    break
                if worker_id in active_set:
                    continue
                key = f"agent:{worker_id}"
                self.procs[key] = self._spawn_agent(worker_id)
                active_set.add(worker_id)
            return
        if len(active) > target:
            for worker_id in reversed(active[target:]):
                key = f"agent:{worker_id}"
                proc = self.procs.pop(key, None)
                if proc is not None:
                    _signal_group(proc, signal.SIGTERM)


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
