# Establishing a baseline

When benchmarking Javascript with different engines the startup time of the engine needs to be considered.  Some engines, such as Hermes, are optimized for very quick startup time.  To ensure that we are performing an apples to applies comparison of engine performance, and not startup, we start by establishing a baseline of how long each engine takes to startup.  We then adjust each benchmark by this startup time.

To measure the startup time we have each engine run on a empty `.js` file.  The startup benchmarks are stored in `$ENGINEBaseline.json`.
