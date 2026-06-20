"""The ONLY LLM in the system: the planner's Claude API calls.

Two forced, strict tool calls on ``claude-opus-4-8`` (configurable):

* ``design_search_space(prompt)`` derives the task contract — numeric objective +
  idea JSON Schema — when a run did not supply one.
* ``propose_ideas(digest, n)`` returns a batch of configs tagged exploit/explore.

Notes on the request shape (kept deliberately robust against 400s):
* Forced ``tool_choice={"type":"tool"}`` is used for reliable structured output;
  extended/adaptive thinking is therefore omitted (forced tool use is not
  compatible with thinking). ``effort`` defaults to high.
* ``strict`` tools cannot express free-form nested objects, so ``idea_schema``
  and each ``config`` are returned as JSON **strings** and parsed here.
"""

from __future__ import annotations

import json
from typing import Any, cast

import anthropic

from .config import settings

_client: anthropic.AsyncAnthropic | None = None


class LLMError(RuntimeError):
    pass


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.has_api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set — the planner requires it.")
        _client = anthropic.AsyncAnthropic()
    return _client


_DESIGN_TOOL = {
    "name": "design_search_space",
    "description": (
        "Define the task contract for an experiment search from the user's "
        "prompt: a single numeric objective to optimize and a JSON Schema "
        "describing one runnable config."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["objective_name", "direction", "idea_schema"],
        "properties": {
            "objective_name": {
                "type": "string",
                "description": "Short snake_case name of the metric, e.g. tokens_per_second.",
            },
            "direction": {"type": "string", "enum": ["maximize", "minimize"]},
            "idea_schema": {
                "type": "string",
                "description": (
                    "A JSON Schema (draft 2020-12) for one config, as a JSON "
                    "string. Must be type 'object' with additionalProperties "
                    "false, a 'required' list, and 3-8 tunable properties. Use "
                    "numeric properties with explicit minimum/maximum, and enum "
                    "properties for categorical knobs."
                ),
            },
        },
    },
}

_PROPOSE_TOOL = {
    "name": "propose_ideas",
    "description": (
        "Propose a batch of experiment configs for the numeric objective. Each "
        "config MUST conform to the provided JSON Schema. Tag each with "
        "origin='exploit' (a small perturbation near a top config) or "
        "origin='explore' (an untried region of the schema)."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["ideas"],
        "properties": {
            "ideas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["config", "rationale", "origin"],
                    "properties": {
                        "config": {
                            "type": "string",
                            "description": "One config object conforming to the schema, as a JSON string.",
                        },
                        "rationale": {"type": "string"},
                        "origin": {"type": "string", "enum": ["exploit", "explore"]},
                    },
                },
            }
        },
    },
}


_PROPOSE_HYPOTHESES_TOOL = {
    "name": "propose_hypotheses",
    "description": (
        "Propose a batch of distinct research ideas — natural-language "
        "hypotheses for new methods implementing the given interface. Tag each "
        "origin='exploit' (refine or combine the best methods so far) or "
        "origin='explore' (a genuinely new direction)."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["ideas"],
        "properties": {
            "ideas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["hypothesis", "rationale", "origin"],
                    "properties": {
                        "hypothesis": {
                            "type": "string",
                            "description": "A concrete, implementable method idea in 1-3 sentences.",
                        },
                        "rationale": {"type": "string"},
                        "origin": {"type": "string", "enum": ["exploit", "explore"]},
                    },
                },
            }
        },
    },
}


def _tool_input(resp: Any, name: str) -> dict[str, Any]:
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == name:
            return block.input
    raise LLMError(f"model did not call the {name} tool")


async def _call(tool: dict[str, Any], system: str, user: str) -> dict[str, Any]:
    client = _get_client()
    try:
        resp = await client.messages.create(
            model=settings.model,
            max_tokens=4096,
            system=system,
            tools=cast(Any, [tool]),
            tool_choice=cast(Any, {"type": "tool", "name": tool["name"]}),
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.APIError as exc:  # rate limit, bad request, server error, ...
        raise LLMError(f"Claude API error: {exc}") from exc
    return _tool_input(resp, tool["name"])


async def design_search_space(prompt: str) -> dict[str, Any]:
    system = (
        "You are an experiment-search planner. Turn the user's goal into a task "
        "contract the search loop can optimize."
    )
    out = await _call(_DESIGN_TOOL, system, f"User goal:\n{prompt}")
    try:
        schema = json.loads(out["idea_schema"])
    except (json.JSONDecodeError, TypeError) as exc:
        raise LLMError(f"idea_schema was not valid JSON: {exc}") from exc
    if not isinstance(schema, dict) or schema.get("type") != "object":
        raise LLMError("idea_schema must be a JSON Schema object")
    return {
        "objective_name": out["objective_name"],
        "direction": out["direction"],
        "idea_schema": schema,
    }


async def propose_hypotheses(*, n: int, domain_blurb: str, interface_source: str,
                             interface_name: str, objective_name: str,
                             direction: str, digest: dict[str, Any],
                             feedback: str | None = None) -> list[dict[str, Any]]:
    system = (
        f"You are a research planner. Domain: {domain_blurb}\n"
        f"Objective: {direction} '{objective_name}'. Propose exactly {n} distinct, "
        f"concrete, implementable research ideas — each a method that subclasses "
        f"`{interface_name}`. Mix exploit (refine or combine the best methods so "
        "far) and explore (genuinely new directions). Do NOT duplicate "
        "already-tried hypotheses. The method interface is:\n"
        f"```python\n{interface_source}\n```"
    )
    user = "Digest of the search so far:\n" + json.dumps(digest, indent=2)
    if feedback:
        user += "\n\nNote: " + feedback
    user += f"\n\nReturn {n} hypotheses via the propose_hypotheses tool."

    out = await _call(_PROPOSE_HYPOTHESES_TOOL, system, user)
    ideas: list[dict[str, Any]] = []
    for item in out.get("ideas", []):
        text = (item.get("hypothesis") or "").strip()
        if text:
            ideas.append({"hypothesis": text, "rationale": item.get("rationale"),
                          "origin": item.get("origin", "explore")})
    return ideas


async def propose_ideas(*, digest: dict[str, Any], n: int, schema: dict[str, Any],
                        objective_name: str, direction: str,
                        feedback: str | None = None) -> list[dict[str, Any]]:
    system = (
        f"You are an experiment-search planner. Objective: {direction} the "
        f"numeric metric '{objective_name}'. Propose exactly {n} configs, "
        "roughly half exploit (perturb near the best results) and half explore "
        "(cover regions of the schema with little or no data). Every config "
        "MUST conform to this JSON Schema:\n" + json.dumps(schema)
    )
    user = "Current digest of results so far:\n" + json.dumps(digest)
    if feedback:
        user += "\n\nThese previous configs failed validation; fix them:\n" + feedback
    user += f"\n\nReturn {n} configs via the propose_ideas tool."

    out = await _call(_PROPOSE_TOOL, system, user)
    ideas: list[dict[str, Any]] = []
    for item in out.get("ideas", []):
        try:
            config = json.loads(item["config"])
        except (json.JSONDecodeError, TypeError, KeyError):
            continue  # drop unparseable configs; validation happens upstream
        if isinstance(config, dict):
            ideas.append({
                "config": config,
                "rationale": item.get("rationale"),
                "origin": item.get("origin", "explore"),
            })
    return ideas
