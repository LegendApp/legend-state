# Repository Guidelines

## Project Structure & Module Organization
Legend State's runtime lives in `src/`, organized by capability (e.g. `react/` adapters, persistence plugins, sync utilities). Shared helpers sit under `src/helpers` and `src/types`. Sync and persistence extensions live in `src/sync*` and `src/persist-plugins/`. Integration-specific entry points (`react.ts`, `sync.ts`, `trace.ts`) mirror the packages published out of `dist/`. Tests reside in `tests/` using `.test.ts[x]` files; example apps and benchmarks are in `examples/` and `benchmarks/`. Generated bundles output to `dist/`—do not edit files there.

## Build, Test, and Development Commands
- `bun install` (preferred) or `npm install` syncs dependencies.
- `npm run lint:check` enforces ESLint rules across `src/` and `tests/`.
- `npm run format:check` verifies Prettier formatting; add `:write` to auto-fix.
- `npm run typecheck` validates the TypeScript surface with `tsc --noEmit`.
- `bun test` runs the Bun-powered unit suite locally; `npm test` delegates to Jest for CI parity.
- `npm run build` performs lint, format checks, Bun tests, then bundles via `tsup` and post-processing.

## Coding Style & Naming Conventions
Code is TypeScript-first with ES modules. Prettier enforces 4-space indentation, 120-character lines, and single quotes; configure editors accordingly. Prefer named exports from modules and camelCase for functions, PascalCase for types/classes, and kebab-case for file names (e.g. `observable-types.ts`). Keep observable factories in `src/create*` and adapters in their respective folders.

## Testing Guidelines
Unit and integration specs live beside peers in `tests/`, mirroring `src/` naming. Use `.test.ts` for library code and `.test.tsx` for React-facing APIs. Tests rely on Jest (`jest.config.json`) and can be executed with `bun test --timeout 50` for quick feedback. When adding new features, cover core behavior, persistence, and tracking scenarios; add happy-dom setup via `tests/happydom.ts` when manipulating the DOM.

## Commit & Pull Request Guidelines
Commits follow Conventional Commit syntax (`feat: react`, `fix: sync`), aligning with `@commitlint/config-conventional`. Group related changes into logical commits and ensure hooks pass before pushing. Pull requests should summarize intent, link issues, and call out behavioral changes or breaking API updates. Include reproduction steps or demo snippets when touching `examples/` or React bindings, and confirm `npm run build` succeeds before requesting review.

## Release & Verification Extras
Before a release or significant PR, run `npm run checksize` to monitor bundle footprint and inspect the generated artifacts in `dist/`. Use `npm run jestclear` if you encounter stale caches, and document any configuration tweaks in `docs/` for downstream adopters.
