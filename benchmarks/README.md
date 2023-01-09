# Legend-State Benchmarks

Legend-state seeks to be the fastest React state management library.  Achieving this requires numerous optimizations which we put in the following categories:

- Architecture Optimizations: Optimizations related to the core design of Legend-state (i.e. how `Proxy` is used)
- Micro-optimizations: Optimizations related to JavaScript primitives (iteration, Object types, etc.)
- Array Optimizations: Optimizations related to the efficient rendering of large lists of data.

## Running Benchmarks

We use [hyperfine](https://github.com/sharkdp/hyperfine) for running benchmarks.  You will need this installed in order to run the benchmark script.

All benchmarked optimizations will have a directory within the relevant optimization category directory (i.e. `architecture-optimizations`, `micro-optimizations`, `array-optimizations`).  Each optimization directory will have a list of JavaScript files that each implement an approach and then a `bench.sh` that uses `hyperfine` to run the benchmark.

You can inspect in the data used for benchmarking in the `data` directory.

After installing `hyperfine` it should be as simple as a `bench.sh` script to see the results of a benchmark.
