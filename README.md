# autoreduce

Automated **research-idea** search — **one planner, eight agents, one ranked table.**

A single LLM **planner** proposes research *ideas* (natural-language hypotheses)
for a sealed task. A bounded **pool of 8 autonomous agents** each claim an idea,
**write a method** that implements the task's fixed interface, and have it
**measured by a sealed, system-owned benchmark**. Verified results — and real
failures — land in a **live ranked table** you watch from anywhere over the web.
The planner loops: seed ideas, then exploit the best methods, explore new
directions, and promote agent follow-ups, until a budget halts the run.

**The agent writes the METHOD; the system owns the MEASUREMENT.** Agents may
write only a method module against a fixed interface; they cannot touch the
benchmark, the baseline, or the result fields — enforced by **path/permission,
not instruction**. That is what keeps every number on the table verified.

```
 prompt ─► planner (Opus, proposes hypotheses) ──► ideas table (queue)
                       ▲ digest                          │ claim_idea (atomic)
                       │                                  ▼
   ranked table ◄─ report (SEALED metric) ◄── 8 agents (Sonnet, Agent SDK)
                                                  │ write method.py (sandboxed)
                                                  ▼ run_benchmark (sealed)
                                          autoreduce.bench  ← the swap point
```

It runs **end-to-end on a laptop with no GPU**: each task ships a deterministic
**stub benchmark** that scores a submitted method. The real vLLM/spec-dec
benchmark swaps in behind the same `Task.run()` contract — one swap point.

## Requirements

- Python 3.10+, Node 18+
- **Claude Code CLI** (`claude`) — the worker agents use the Claude Agent SDK,
  which drives the CLI. Install it if you don't have it (`npm i -g
  @anthropic-ai/claude-code`), or just run the **fake-agent** mode below.
- **`ANTHROPIC_API_KEY`** — the planner and the agents call Claude.

## Quickstart

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .                      # pulls anthropic + claude-agent-sdk

cp .env.example .env                  # put your key in .env
python -m autoreduce                  # API + planner + 8 agent-workers on :8000

cd web && npm install && npm run dev  # http://localhost:3000
```

Open <http://localhost:3000>, **Open the dashboard**, **Start a run** with a
prompt (e.g. *"find a better speculative-decoding draft strategy"*). Watch the 8
agent boxes write + benchmark methods and the ranked table fill with verified
speedups and real failures.

### Key-free / CLI-free demo

```bash
AUTOREDUCE_FAKE_AGENT=1 python -m autoreduce
```

Replaces the Agent SDK with a deterministic fake agent (writes the task's sample
method, ~30% fail) so the **whole loop** — claim → method → sealed benchmark →
report → table → budget halt — runs with **no API key and no CLI**. Seed the
queue yourself (the planner needs a key); the engine and benchmark are fully
covered by the key-free test suite.

## Tests

```bash
pip install pytest && pytest
```

Key-free: the atomic claim (zero double-allocation, budget halt), the sealed
benchmark (scoring + graceful failure), and the agentic loop (fake agent, sealed
metric integrity, and the **workspace path guard**).

## Tasks (the swappable contract — external, not in the package)

A **task** is one sealed research domain: its method interface, fixed workload,
baseline, and measurement. **The `autoreduce` package ships zero domains.** Tasks
live in a tasks directory (default `./examples`, set by `AUTOREDUCE_TASKS_DIR`)
and are loaded by folder name at runtime; the directory is put on `sys.path` so
the task — and the agent's `method.py` that imports its interface — resolve as a
top-level package. The bundled example is `examples/specdec/`.

**Adding a domain is a new task package, zero core change:** a folder under the
tasks dir whose `__init__.py` exposes `TASK` (an `autoreduce.bench.Task` with
`id`, `objective_name`, `direction`, `interface_name`, `interface_import`,
`domain_blurb`, `interface_source()`, `run()`, `sample_method()`) and a
re-exported interface class. Start a run against it with `{"task": "<folder>"}`,
or set `AUTOREDUCE_TASK`. Each task's `run()` is the one swap point for its real
benchmark. Deleting `examples/specdec/` removes spec-dec entirely — nothing in
the package references it.

## How sealing works

1. **No code execution for the agent.** Bash/web/discovery tools are denied; the
   only way to run anything is the system-owned `run_benchmark` tool.
2. **Workspace-confined writes.** `Write`/`Edit` are kept out of the allowlist so
   they route through a `can_use_tool` path guard that denies any write outside
   the agent's workspace (proven: out-of-workspace writes are refused).
3. **System-computed metric.** The reported number is always a worker-run sealed
   benchmark over the final `method.py` — never anything the agent claims;
   `submit` carries only a text diff + an optional follow-up.

## Configuration

`.env` / environment (see `.env.example`):

| Var | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Planner + agent credentials. |
| `AUTOREDUCE_MODEL` | `claude-opus-4-8` | Planner model. |
| `AUTOREDUCE_AGENT_MODEL` | `claude-sonnet-4-6` | The 8 worker agents. |
| `AUTOREDUCE_TASKS_DIR` | `examples` | Directory of external task packages. |
| `AUTOREDUCE_TASK` | *(first found)* | Default task folder name; else the first in the tasks dir. |
| `AUTOREDUCE_POOL_SIZE` | `8` | Agents / GPU slots. |
| `AUTOREDUCE_DEFAULT_BUDGET` | `40` | Completed methods before a run halts. |
| `AUTOREDUCE_AGENT_TIMEOUT` | `180` | Per-idea wall-clock (reaper backstop is higher). |
| `AUTOREDUCE_AGENT_MAX_BUDGET_USD` | `0.50` | Per-agent-session cost cap. |
| `AUTOREDUCE_FAKE_AGENT` | — | `1` → key-free / CLI-free fake agent. |

## Out of scope (intentionally)

Real vLLM benchmark (the stub is the seam), the config-tuning inner loop (the old
config-search path is dormant; a promising method gets its hyperparameters tuned
later), auth, cloud deploy.
