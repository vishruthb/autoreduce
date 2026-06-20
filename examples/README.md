# External tasks

autoreduce ships **no research domains**. A *task* is a sealed domain — its method
interface, fixed workload, baseline, and measurement — that lives here (outside
the `autoreduce` package) and is loaded by folder name at runtime
(`AUTOREDUCE_TASKS_DIR`, default `examples`).

`specdec/` is the bundled example (speculative decoding, a stub benchmark). To add
a domain, copy its shape: a package exposing `TASK` (an `autoreduce.bench.Task`)
and a re-exported interface class. Delete `specdec/` and the package is fully
domain-free.
