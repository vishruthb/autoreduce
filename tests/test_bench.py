"""Key-free tests for the sealed measurement framework + the spec-dec task."""

from __future__ import annotations

from autoreduce.bench import list_tasks, load_task

TASK = load_task("specdec")

NGRAM = """
from specdec import SpeculationStrategy
class Strategy(SpeculationStrategy):
    name = "ngram"
    def propose(self, context, k):
        for n in (4, 3, 2, 1):
            if len(context) < n:
                continue
            pat = context[-n:]
            for i in range(len(context) - n - 1, -1, -1):
                if context[i:i+n] == pat:
                    return context[i+n:i+n+k]
        return []
"""

TRIVIAL = """
from specdec import SpeculationStrategy
class Strategy(SpeculationStrategy):
    name = "repeat"
    def propose(self, context, k):
        return [context[-1]] * k if context else []
"""

BROKEN = """
from specdec import SpeculationStrategy
class Strategy(SpeculationStrategy):
    def propose(self, context, k):
        raise ValueError("kaboom")
"""

NO_STRATEGY = "x = 1\n"


def _write(tmp_path, name, src):
    p = tmp_path / name
    p.write_text(src)
    return str(p)


def test_task_is_discoverable_and_described():
    assert "specdec" in list_tasks()
    assert TASK.objective_name and TASK.direction == "maximize"
    assert "class SpeculationStrategy" in TASK.interface_source()
    assert TASK.interface_import == "from specdec import SpeculationStrategy"


def test_good_method_beats_baseline(tmp_path):
    res = TASK.run(_write(tmp_path, "m.py", NGRAM))
    assert res["status"] == "ok"
    assert res["error"] is None
    assert res["baseline"] == 1.0
    assert res["metric"] > 1.0
    assert res["summary"]


def test_trivial_method_is_penalized(tmp_path):
    good = TASK.run(_write(tmp_path, "g.py", NGRAM))
    triv = TASK.run(_write(tmp_path, "t.py", TRIVIAL))
    assert triv["status"] == "ok"
    assert triv["metric"] < good["metric"]
    assert triv["metric"] < 1.0


def test_broken_method_fails_gracefully(tmp_path):
    res = TASK.run(_write(tmp_path, "b.py", BROKEN))
    assert res["status"] == "failed"
    assert res["metric"] is None
    assert "kaboom" in res["error"]


def test_missing_strategy_fails_gracefully(tmp_path):
    res = TASK.run(_write(tmp_path, "n.py", NO_STRATEGY))
    assert res["status"] == "failed"
    assert res["metric"] is None
    assert "Strategy" in res["error"]


def test_metric_is_deterministic(tmp_path):
    path = _write(tmp_path, "m.py", NGRAM)
    assert TASK.run(path)["metric"] == TASK.run(path)["metric"]


def test_sample_methods_round_trip(tmp_path):
    good = TASK.run(_write(tmp_path, "g.py", TASK.sample_method(broken=False)))
    bad = TASK.run(_write(tmp_path, "b.py", TASK.sample_method(broken=True)))
    assert good["status"] == "ok" and good["metric"] > 1.0
    assert bad["status"] == "failed"
