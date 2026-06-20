"""Resource and workload shapes for decoupled benchmark scheduling."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal


@dataclass(frozen=True)
class ResourceShape:
    gpu_count: int = 1
    gpu_type: str = "local"
    placement: Literal["single_gpu", "single_node", "distributed"] = "single_gpu"

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "ResourceShape":
        data = data or {}
        gpu_count = int(data.get("gpu_count") or 1)
        placement = data.get("placement") or (
            "single_gpu" if gpu_count == 1 else "single_node"
        )
        return cls(
            gpu_count=max(1, gpu_count),
            gpu_type=str(data.get("gpu_type") or "local"),
            placement=placement,
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class WorkloadShape:
    batch_size: int | None = None
    concurrency: int | None = None
    n_candidates: int | None = None
    precision: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "WorkloadShape":
        data = data or {}
        return cls(
            batch_size=data.get("batch_size"),
            concurrency=data.get("concurrency"),
            n_candidates=data.get("n_candidates"),
            precision=data.get("precision"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}
