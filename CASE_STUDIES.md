# Autoreduce Case Studies: Scale-Aware Agentic Search for Distributed Inference Systems

> **Status.** These case studies are written as paper-style demo studies for the Autoreduce pitch. The agent traces, metrics, and scale curves are synthetic but internally consistent. They are intended to explain how the harness works, not to claim real production benchmark results.

## Abstract

Autoreduce is a distributed autoresearch harness for large-scale ML systems. Instead of only asking agents to propose new algorithms, it also asks which resource and workload regimes should be used to evaluate those algorithms. This matters for inference and serving systems, where speculative decoding, best-of-n search, mixed-precision candidate generation, tensor parallelism, batch size, and request concurrency can all change whether a method is actually useful.

We present two synthetic case studies. The first studies batching strategies for speculative decoding, motivated by a discussion at Etched about the combinatorics of batching and verification. The second studies low-bit candidate search followed by higher-bit verification or rendering, a pattern relevant to best-of-n inference, test-time search, RL-style inference-time optimization, and world-model rollouts. Across both studies, Autoreduce uses two optimization layers: agent elasticity, where agent workers scale independently of GPU execution, and experiment elasticity, where benchmark jobs can request 1/2/4/8 GPU bundles. The output is not just a ranked table, but scale curves showing where each method becomes effective.

## 1. System Overview

Autoreduce separates research reasoning from GPU execution.

```text
Planner Agent
    -> Idea Queue
    -> Agent Workers
    -> Experiment Queue
    -> GPU Bundle Scheduler
    -> Benchmark Workers
    -> Sealed Benchmark
    -> Results + Scale Curves
    -> Planner Digest
```

An **idea** is an algorithmic hypothesis. An **experiment** is a concrete measurement of that idea under a specific resource and workload shape. This split is the key architectural difference. It lets the planner compare the same idea under different GPU counts, batch sizes, concurrency levels, and precision regimes.

The decoupled architecture has two optimization layers:

1. **Agent elasticity.** Agents no longer permanently own GPUs. Multiple agents can think, edit, and prepare methods while benchmark workers serialize or batch GPU measurements. With one GPU, this becomes parallel thinking plus serial measurement. With many GPUs, the system increases agent concurrency to keep the benchmark queue healthy.
2. **Experiment elasticity.** Benchmark jobs can request GPU bundles. Most ideas begin as cheap one-GPU smoke or proxy tests. Promising scale-sensitive methods receive 2/4/8 GPU probes, allowing the system to build scale curves and decide when to scale up or down.

All reported metrics come from the sealed benchmark. Agents write `method.py`, but the benchmark worker owns the final measurement.

## 2. Related Work and Motivation

Speculative decoding accelerates autoregressive generation by using a smaller draft model or lightweight proposal mechanism to generate multiple candidate tokens, then verifying them with the target model in parallel. Leviathan et al. introduced fast transformer inference via speculative decoding, while Chen et al. presented speculative sampling and reported 2--2.5x speedups in a distributed Chinchilla setup without changing the model output distribution.

Serving systems make speculative decoding harder because batching, KV-cache memory, prefill/decode scheduling, and latency constraints interact. vLLM and PagedAttention showed that KV-cache memory management is central to high-throughput LLM serving, reporting 2--4x throughput improvements over prior systems under comparable latency. Sarathi and Sarathi-Serve studied prefill/decode scheduling, chunked prefills, decode-maximal batching, and stall-free scheduling to improve GPU utilization and tail latency.

Low-bit inference and training work motivates the second case study. QLoRA showed that 4-bit quantization can preserve strong downstream performance while reducing memory enough to finetune very large models on limited hardware. AWQ showed that activation-aware weight quantization can make low-bit LLM inference practical by protecting salient channels. Newer hardware trends, including FP8 and sub-8-bit formats such as FP4/MXFP-style formats, make it increasingly natural to search in low precision and verify or render in higher precision.

Autoreduce is not a replacement for these systems. It is a harness for automatically searching over the algorithmic and systems choices that make these systems work.

## 3. Case Study 1: Speculative Decoding Batching

### 3.1 Problem Statement

During a visit to Etched, Chief Architect Saptadeep Pal described a practical problem in speculative decoding: the combinatorics of batching. In production serving, requests differ in prompt length, remaining decode length, draft acceptance behavior, latency class, and KV-cache pressure. A speculative decoding policy must choose how to group requests, how many draft tokens to propose, when to verify, and whether to allocate more GPUs to candidate generation or verification.

A one-GPU benchmark can be misleading. Some methods look weak because candidate branches are serialized, while the same method becomes useful when candidates or verification groups are distributed across multiple GPUs. This makes speculative decoding a natural case study for scale-aware autoresearch.

### 3.2 Planner Prompt

```text
We are optimizing speculative decoding for high-throughput LLM serving.

The bottleneck is the combinatorics of batching. Each request may have a different prompt length, decode length, draft acceptance rate, and optimal draft length. The system must decide how to batch requests together, how many draft tokens to propose, and when to verify them with the target model.

Your goal is to search for batching and verification strategies that improve quality-adjusted throughput while respecting tail latency.

You may propose methods that change:
- draft length selection
- request grouping
- verification scheduling
- candidate batching
- acceptance-rate-aware routing
- multi-GPU partitioning
- prefill/decode interleaving
- precision choices for draft or candidate scoring

The benchmark will evaluate:
- speedup over baseline decoding
- accepted tokens per target-model call
- p50 / p95 latency
- throughput
- GPU utilization
- memory pressure
- cost-adjusted throughput

Start with broad one-GPU experiments. If a method appears scale-sensitive, propose 2-GPU or 4-GPU scale probes. Only recommend 8-GPU validation if the scale curve justifies it.
```

### 3.3 Experimental Setup

The synthetic benchmark models an online LLM serving workload with heterogeneous requests.

```text
Baseline: standard autoregressive decoding
Primary metric: quality-adjusted throughput speedup
Latency constraint: p95 latency <= 250 ms
Initial allocation: 8 one-GPU experiments
Scale probe candidates: 2/4/8 GPU bundles
Result type: synthetic sealed benchmark output
```

The benchmark records:

```text
speedup
accepted tokens per target-model call
p50 latency
p95 latency
GPU utilization
peak memory
failure reason, if any
```

### 3.4 Agent Results: Broad One-GPU Search

#### Agent 1: Fixed Draft-Length Batching

**Hypothesis.** Use a fixed draft length for all requests, but batch requests by similar remaining decode length to reduce padding and verification waste.

**Strategy.** Requests are bucketed by remaining output length. Each bucket uses draft length 4. Verification is performed over compatible request groups.

```text
GPU count: 1
batch size: 32
draft length: 4
speedup: 1.11x
accepted tokens / target call: 2.3
p50 latency: 93 ms
p95 latency: 221 ms
GPU utilization: 61%
status: keep as baseline
```

**Planner interpretation.** Stable baseline, but not obviously scale-sensitive. Keep for comparison.

#### Agent 2: Acceptance-Rate-Aware Draft Length

**Hypothesis.** Dynamically choose draft length based on each request's recent acceptance rate.

**Strategy.** Easy requests receive longer drafts, while hard requests receive shorter drafts.

```text
if acceptance rate > 0.75: draft length = 8
if 0.45 <= acceptance rate <= 0.75: draft length = 4
if acceptance rate < 0.45: draft length = 2
```

```text
GPU count: 1
batch size: 32
draft length: adaptive 2/4/8
speedup: 1.28x
accepted tokens / target call: 3.1
p50 latency: 88 ms
p95 latency: 239 ms
GPU utilization: 67%
status: top one-GPU candidate
```

**Planner interpretation.** Strong one-GPU signal. Candidate for later hybridization.

#### Agent 3: Verification-Maximal Batching

**Hypothesis.** Delay verification slightly to form larger target-model verification batches.

**Strategy.** Candidate sequences are collected during a small batching window, sorted by draft length, and verified as a larger group.

```text
GPU count: 1
batch size: 64
draft length: 4
speedup: 1.22x
accepted tokens / target call: 2.8
p50 latency: 105 ms
p95 latency: 276 ms
GPU utilization: 74%
status: failed latency constraint
```

**Planner interpretation.** Throughput improves, but p95 violates the serving constraint. Revisit only for offline throughput mode.

#### Agent 4: Prefill/Decode Interleaving

**Hypothesis.** Use chunked prefill and decode piggybacking to reduce underutilized decode-only batches.

**Strategy.** Long prompts are split into fixed prefill chunks. Decode verification jobs are scheduled alongside prefill chunks to improve utilization.

```text
GPU count: 1
batch size: 48
draft length: 4
speedup: 1.19x
accepted tokens / target call: 2.6
p50 latency: 97 ms
p95 latency: 232 ms
GPU utilization: 79%
status: keep
```

**Planner interpretation.** Good systems idea. Useful under mixed prefill/decode load, but not the best first scale probe.

#### Agent 5: Candidate-Parallel Multi-GPU Drafting

**Hypothesis.** Generate multiple draft branches in parallel, rank them using cheap confidence estimates, and verify only the best branch.

**Strategy.** On one GPU, branches are serialized. On multiple GPUs, candidate branches can be distributed across devices.

```text
GPU count: 1
batch size: 16
candidate branches: 4
speedup: 1.06x
accepted tokens / target call: 3.4
p50 latency: 121 ms
p95 latency: 248 ms
GPU utilization: 58%
status: scale-sensitive
```

**Planner interpretation.** Weak one-GPU speedup, but high candidate quality and parallelizable bottleneck. Do not discard. Schedule scale probe.

#### Agent 6: KV-Cache-Aware Grouping

**Hypothesis.** Group requests by KV-cache pressure to reduce fragmentation and memory bottlenecks.

**Strategy.** Requests are bucketed by estimated KV block use, avoiding pathological mixtures of long-context and short-context requests.

```text
GPU count: 1
batch size: 64
draft length: 4
speedup: 1.15x
accepted tokens / target call: 2.4
p50 latency: 101 ms
p95 latency: 229 ms
GPU utilization: 65%
peak memory: -18% vs baseline batching
status: useful support strategy
```

**Planner interpretation.** Not the strongest standalone method, but useful for memory-aware batching and larger batch sizes.

#### Agent 7: Latency-Class Routing

**Hypothesis.** Separate interactive and throughput-oriented requests, applying different speculative policies to each class.

**Strategy.** Interactive requests use short drafts and tight batching windows. Offline/batch requests use longer drafts and larger verification batches.

```text
GPU count: 1
batch size: mixed
draft length: class-dependent
speedup: 1.13x
accepted tokens / target call: 2.2
p50 latency: 76 ms
p95 latency: 198 ms
GPU utilization: 59%
status: keep for latency-sensitive regime
```

**Planner interpretation.** Good for strict SLO workloads, not the best max-throughput method.

#### Agent 8: Hybrid Adaptive Draft + KV-Aware Batching

**Hypothesis.** Combine acceptance-rate-aware draft length with KV-cache-aware request grouping.

**Strategy.** Requests are first grouped by KV pressure, then sub-grouped by rolling acceptance-rate bucket. Each subgroup receives an adaptive draft length.

```text
GPU count: 1
batch size: 64
draft length: adaptive 2/4/8
speedup: 1.34x
accepted tokens / target call: 3.2
p50 latency: 84 ms
p95 latency: 225 ms
GPU utilization: 76%
peak memory: -12% vs baseline batching
status: best one-GPU result
```

**Planner interpretation.** Best general serving policy. Schedule 2-GPU and 4-GPU scale probes.

### 3.5 Multi-GPU Scale Probes

The planner selected two methods for scale probing:

```text
Agent 5: Candidate-Parallel Multi-GPU Drafting
Agent 8: Hybrid Adaptive Draft + KV-Aware Batching
```

#### Scale Probe A: Candidate-Parallel Drafting

```text
1 GPU:
  candidate branches: 4
  speedup: 1.06x
  p95 latency: 248 ms
  GPU utilization: 58%

2 GPUs:
  candidate branches: 8
  speedup: 1.23x
  p95 latency: 236 ms
  GPU utilization: 69%

4 GPUs:
  candidate branches: 16
  speedup: 1.41x
  p95 latency: 241 ms
  GPU utilization: 76%

8 GPUs:
  candidate branches: 32
  speedup: 1.43x
  p95 latency: 259 ms
  GPU utilization: 71%
```

**Conclusion.** Candidate-parallel drafting is weak on one GPU but strong at four GPUs. The 8-GPU point provides little marginal throughput and worsens p95 latency. The planner validates at four GPUs and returns the remaining capacity to broad search.

#### Scale Probe B: Hybrid Adaptive + KV-Aware Batching

```text
1 GPU:
  batch size: 64
  speedup: 1.34x
  p95 latency: 225 ms
  GPU utilization: 76%

2 GPUs:
  batch size: 96
  speedup: 1.44x
  p95 latency: 231 ms
  GPU utilization: 78%

4 GPUs:
  batch size: 128
  speedup: 1.48x
  p95 latency: 246 ms
  GPU utilization: 80%

8 GPUs:
  batch size: 192
  speedup: 1.47x
  p95 latency: 271 ms
  GPU utilization: 77%
```

**Conclusion.** The hybrid policy is the best general one-GPU method and improves modestly to four GPUs. It is less scale-sensitive than candidate-parallel drafting and fails the p95 constraint at eight GPUs.

### 3.6 Summary Table

| Method | 1 GPU | 2 GPUs | 4 GPUs | 8 GPUs | Decision |
|---|---:|---:|---:|---:|---|
| Fixed draft-length batching | 1.11x | — | — | — | Baseline |
| Acceptance-aware draft length | 1.28x | — | — | — | Merged into hybrid |
| Verification-maximal batching | 1.22x | — | — | — | Rejected for p95 |
| Prefill/decode interleaving | 1.19x | — | — | — | Keep for mixed load |
| Candidate-parallel drafting | 1.06x | 1.23x | 1.41x | 1.43x | Best scale-sensitive method |
| KV-cache-aware grouping | 1.15x | — | — | — | Useful support strategy |
| Latency-class routing | 1.13x | — | — | — | Useful under strict SLO |
| Hybrid adaptive + KV-aware batching | 1.34x | 1.44x | 1.48x | 1.47x | Best general serving method |

### 3.7 Main Takeaway

The best one-GPU method was not the same as the most scale-sensitive method. Candidate-parallel drafting would likely be discarded by a flat one-GPU leaderboard, but it becomes competitive when evaluated under a multi-GPU resource shape. This is the central value of scale-aware autoresearch: the harness searches not only over algorithms, but over the resource regimes where those algorithms become effective.

## 4. Case Study 2: Low-Bit Search Space, Higher-Bit Render

### 4.1 Problem Statement

Many inference-time optimization methods have a two-stage structure. A system first performs cheap search over many candidates, then applies expensive high-quality verification or rendering only to the most promising candidates.

This is common in:

```text
best-of-n inference
RL-style inference-time search
test-time training or adaptation
world-model rollouts
low-bit candidate generation
high-bit final verification or render
```

The question is whether low-bit search is only useful under certain resource regimes. A one-GPU run may serialize candidate generation and make the method look slow. With more GPUs, low-bit candidate generation can be parallelized while BF16 verification is reserved for the best candidates.

### 4.2 Planner Prompt

```text
We are optimizing an inference-time search pipeline.

The method may generate many candidate trajectories, completions, or render hypotheses in low precision, then verify or render the best candidates in higher precision.

Your goal is to search for methods that improve quality-adjusted throughput under a latency and cost budget.

You may change:
- candidate count
- candidate precision, including FP8/NVFP4-style low-bit modes
- final verification or render precision, including BF16
- ranking heuristics
- early-exit thresholds
- batching policy
- GPU count
- candidate partitioning across GPUs

The benchmark will evaluate:
- quality-adjusted speedup
- candidate throughput
- final verification cost
- p95 latency
- memory pressure
- cost-adjusted quality

Start with one-GPU smoke tests. If candidate generation dominates runtime or if more candidates improve quality, schedule multi-GPU scale probes.
```

### 4.3 Experimental Setup

```text
Baseline: BF16 candidate generation + BF16 verification for all candidates
Primary metric: quality-adjusted throughput speedup
Quality constraint: normalized quality >= 0.98 of BF16 baseline
Latency constraint: p95 <= 300 ms
Initial search: one-GPU smoke/proxy tests
Scale probes: 2/4/8 GPU bundles
Result type: synthetic sealed benchmark output
```

### 4.4 Agent Results: Broad Search

#### Agent 1: FP8 Candidate Search + BF16 Top-1 Verify

**Hypothesis.** Generate all candidates in FP8, rank them cheaply, and verify only the top candidate in BF16.

```text
GPU count: 1
candidate precision: FP8
final precision: BF16
n candidates: 16
speedup: 1.21x
quality: 0.982
p95 latency: 244 ms
status: promising
```

**Planner interpretation.** Good quality and speed. Candidate generation remains dominant, so scale probing may help.

#### Agent 2: NVFP4 Candidate Search + BF16 Top-2 Verify

**Hypothesis.** Use an aggressive four-bit candidate pass, but verify the top two candidates in BF16 to recover quality.

```text
GPU count: 1
candidate precision: NVFP4-style simulated
final precision: BF16
n candidates: 32
speedup: 1.18x
quality: 0.991
p95 latency: 268 ms
status: promising and scale-sensitive
```

**Planner interpretation.** Strong quality because top-2 verification corrects low-bit noise. Candidate generation is parallelizable. Schedule scale probe.

#### Agent 3: Low-Bit Search with Early Exit

**Hypothesis.** Stop low-bit candidate generation once the best candidate exceeds a confidence threshold.

```text
GPU count: 1
candidate precision: FP8
final precision: BF16
n candidates: adaptive 4-32
speedup: 1.26x
quality: 0.975
p95 latency: 219 ms
status: failed quality threshold
```

**Planner interpretation.** Fast, but quality is too low. Revisit with a stricter threshold.

#### Agent 4: BF16 Search with Low-Bit Ranking Cache

**Hypothesis.** Keep candidate generation in BF16, but use low-bit cached features for ranking and pruning.

```text
GPU count: 1
candidate precision: BF16
ranking precision: FP8
final precision: BF16
n candidates: 16
speedup: 1.09x
quality: 0.996
p95 latency: 287 ms
status: high quality, low speedup
```

**Planner interpretation.** Safe but not aggressive enough. Use as quality reference.

#### Agent 5: Two-Stage Low-Bit Cascade

**Hypothesis.** Use a very cheap first-stage low-bit pass to remove weak candidates, then rerank survivors in FP8 and verify in BF16.

```text
GPU count: 1
stage 1: NVFP4-style simulated
stage 2: FP8
final precision: BF16
n candidates: 64 -> 8 -> 2
speedup: 1.32x
quality: 0.986
p95 latency: 252 ms
status: best one-GPU result
```

**Planner interpretation.** Best single-GPU candidate and obviously scale-sensitive. Schedule 2/4/8 GPU probes.

#### Agent 6: Candidate-Parallel BF16 Verification

**Hypothesis.** Keep low-bit search simple, but distribute BF16 verification of the top candidates across GPUs.

```text
GPU count: 1
candidate precision: FP8
final precision: BF16
n candidates: 32
verified candidates: 4
speedup: 1.12x
quality: 0.997
p95 latency: 296 ms
status: scale-sensitive but too slow on 1 GPU
```

**Planner interpretation.** Weak on one GPU because verification is serialized. Good multi-GPU candidate.

### 4.5 Multi-GPU Scale Probes

The planner selected three methods for scale probing:

```text
Agent 2: NVFP4-style candidate search + BF16 top-2 verify
Agent 5: Two-stage low-bit cascade
Agent 6: Candidate-parallel BF16 verification
```

#### Scale Probe A: NVFP4 Candidate Search + BF16 Top-2 Verify

```text
1 GPU:
  n candidates: 32
  speedup: 1.18x
  quality: 0.991
  p95 latency: 268 ms

2 GPUs:
  n candidates: 64
  speedup: 1.39x
  quality: 0.993
  p95 latency: 259 ms

4 GPUs:
  n candidates: 128
  speedup: 1.57x
  quality: 0.994
  p95 latency: 272 ms

8 GPUs:
  n candidates: 256
  speedup: 1.58x
  quality: 0.994
  p95 latency: 315 ms
```

**Conclusion.** The method improves strongly through four GPUs. At eight GPUs, latency exceeds the constraint with almost no added speedup. Best resource point: four GPUs.

#### Scale Probe B: Two-Stage Low-Bit Cascade

```text
1 GPU:
  candidate funnel: 64 -> 8 -> 2
  speedup: 1.32x
  quality: 0.986
  p95 latency: 252 ms

2 GPUs:
  candidate funnel: 96 -> 12 -> 2
  speedup: 1.51x
  quality: 0.989
  p95 latency: 248 ms

4 GPUs:
  candidate funnel: 128 -> 16 -> 2
  speedup: 1.68x
  quality: 0.991
  p95 latency: 261 ms

8 GPUs:
  candidate funnel: 192 -> 24 -> 2
  speedup: 1.70x
  quality: 0.991
  p95 latency: 304 ms
```

**Conclusion.** Best overall method. Strong speedup and quality through four GPUs; eight GPUs is not cost-effective.

#### Scale Probe C: Candidate-Parallel BF16 Verification

```text
1 GPU:
  verified candidates: 4
  speedup: 1.12x
  quality: 0.997
  p95 latency: 296 ms

2 GPUs:
  verified candidates: 4
  speedup: 1.33x
  quality: 0.997
  p95 latency: 241 ms

4 GPUs:
  verified candidates: 8
  speedup: 1.44x
  quality: 0.998
  p95 latency: 248 ms

8 GPUs:
  verified candidates: 8
  speedup: 1.45x
  quality: 0.998
  p95 latency: 266 ms
```

**Conclusion.** Good high-quality validation path, but lower throughput than the two-stage cascade. Keep as a safety mode for quality-critical workloads.

### 4.6 Summary Table

| Method | 1 GPU | 2 GPUs | 4 GPUs | 8 GPUs | Quality @ Best | Decision |
|---|---:|---:|---:|---:|---:|---|
| FP8 search + BF16 top-1 | 1.21x | — | — | — | 0.982 | Keep |
| NVFP4-style search + BF16 top-2 | 1.18x | 1.39x | 1.57x | 1.58x | 0.994 | Best at 4 GPUs |
| Low-bit early exit | 1.26x | — | — | — | 0.975 | Failed quality |
| BF16 search + FP8 rank cache | 1.09x | — | — | — | 0.996 | Quality reference |
| Two-stage low-bit cascade | 1.32x | 1.51x | 1.68x | 1.70x | 0.991 | Best overall |
| Candidate-parallel BF16 verify | 1.12x | 1.33x | 1.44x | 1.45x | 0.998 | Safety mode |

### 4.7 Main Takeaway

Low-bit search becomes most useful when candidate generation and verification can be separated. The best strategy was not simply the lowest precision or the largest number of candidates. The best strategy was a two-stage cascade that used very low precision for broad pruning, FP8-style scoring for reranking, and BF16 for final verification. Like the speculative decoding case study, the scale curve showed that four GPUs was the best operating point: enough parallelism to make candidate search worthwhile, but not so much that latency and scheduling overhead dominated.

## 5. Discussion

The case studies illustrate three design principles.

### 5.1 A Flat Leaderboard Is Not Enough

A ranked table over one-GPU results can discard methods that are designed to scale. Candidate-parallel drafting in the speculative decoding case study looked weak on one GPU but became competitive at four GPUs. Scale curves are necessary for this class of systems research.

### 5.2 Agent Scheduling and GPU Scheduling Are Different Problems

Agents should scale with reasoning throughput and benchmark queue pressure. GPU jobs should scale with resource demand and experimental value. Coupling one agent to one GPU hides this distinction and can waste expensive accelerators.

### 5.3 The Planner Should Decide What Information Is Worth Buying

The planner should not blindly allocate more GPUs. It should ask whether a scale probe would reduce uncertainty. In both case studies, the 8-GPU points were not worth it despite being available. The system learned to validate at four GPUs and return the remaining capacity to broad search.

## 6. Conclusion

Autoreduce extends the autoresearch loop from autonomous experimentation to scale-aware systems research. The key idea is to search over both algorithms and the resource regimes where those algorithms work. Agents propose and implement methods; the scheduler allocates GPU bundles; the sealed benchmark produces trusted metrics; and the planner learns from scale curves rather than a flat leaderboard.

These synthetic case studies show how the same harness can reason about speculative decoding batching, low-bit candidate search, high-bit verification, and multi-GPU evaluation. The broader goal is a distributed autoresearch system for ML workloads where batching, precision, memory, communication, and GPU topology are part of the optimization space.

## References

1. Yaniv Leviathan, Matan Kalman, and Yossi Matias. *Fast Inference from Transformers via Speculative Decoding*. 2023. https://arxiv.org/abs/2211.17192
2. Charlie Chen, Sebastian Borgeaud, Geoffrey Irving, Jean-Baptiste Lespiau, Laurent Sifre, and John Jumper. *Accelerating Large Language Model Decoding with Speculative Sampling*. 2023. https://arxiv.org/abs/2302.01318
3. Woosuk Kwon et al. *Efficient Memory Management for Large Language Model Serving with PagedAttention*. 2023. https://arxiv.org/abs/2309.06180
4. Amey Agrawal et al. *SARATHI: Efficient LLM Inference by Piggybacking Decodes with Chunked Prefills*. 2023. https://arxiv.org/abs/2308.16369
5. Amey Agrawal et al. *Sarathi-Serve: Improved LLM Serving with Stall-Free Scheduling*. 2024. https://arxiv.org/abs/2403.02310
6. Ji Lin et al. *AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration*. 2023. https://arxiv.org/abs/2306.00978
7. Tim Dettmers et al. *QLoRA: Efficient Finetuning of Quantized LLMs*. 2023. https://arxiv.org/abs/2305.14314
8. Paulius Micikevicius et al. *FP8 Formats for Deep Learning*. 2022. https://arxiv.org/abs/2209.05433
9. Bita Darvish Rouhani et al. *Microscaling Data Formats for Deep Learning*. 2023. https://arxiv.org/abs/2310.10537
