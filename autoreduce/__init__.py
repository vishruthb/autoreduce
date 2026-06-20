"""autoreduce — automated experiment reduction.

A single LLM planner proposes experiment configs ("ideas") for a numeric
objective; a bounded pool of 8 worker processes runs them through a harness on
8 logical GPU slots; results land in a live ranked table.
"""

__version__ = "0.1.0"
