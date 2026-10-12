hyperfine --warmup 3 --runs 1000 --export-json hermesBaseline.json "hermes empty.js"

hyperfine --warmup 3 --runs 1000 --export-json nodeBaseline.json "node empty.js"