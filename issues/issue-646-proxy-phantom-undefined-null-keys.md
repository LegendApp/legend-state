---
id: issue-646
source_type: github_issue
source: .github-cache/open/issues/00646-proxy-creates-phantom-entries-when-accessing-undefined-null-keys-on-record-obser.md
repo: /Users/jay/Documents/code/legendapp/legend-state
issue_number: 646
issue_url: https://github.com/LegendApp/legend-state/issues/646
issue_title: Proxy creates phantom entries when accessing undefined/null keys on record observables
triage_status: reproduced
severity: medium
approval: approved
implementation_status: done
base_ref: core@4ecd0b20
agent_doc_version: 1
updated_at: 2026-07-02T12:53:36Z
---

# Issue

- Source: `.github-cache/open/issues/00646-proxy-creates-phantom-entries-when-accessing-undefined-null-keys-on-record-obser.md`
- URL: https://github.com/LegendApp/legend-state/issues/646
- Title: Proxy creates phantom entries when accessing undefined/null keys on record observables
- Repo: `/Users/jay/Documents/code/legendapp/legend-state`
- Base: `core@4ecd0b20`

# Triage

- Status: reproduced
- Severity: medium
- Confidence: high

Summary: The direct read pattern does not write parent record data by itself. The reproduced failure is in synced object-list normalization: when `syncedSupabase` / `syncedCrud({ as: 'object' })` receives a row whose configured `fieldId` is `undefined` or `null`, the row is coerced into a `"undefined"` or `"null"` record key. A nullish-key read can activate the synced load, making the read look causal.

Decision: Add regression coverage for direct nullish-key reads and guard synced object/map record normalization against nullish row IDs.

# Evidence

- Issue repro: `cards$[deckId].get()` with `deckId === undefined`, plus `cards$[null as any].get()`, creates phantom keys.
- `src/ObservableObject.ts:449` creates child proxies in `getProxy(node, p)` when `p !== undefined`.
- `src/ObservableObject.ts:638` falls through to `getProxy(node, p)` for ordinary object property access.
- `src/globals.ts:130` caches child nodes, and `src/globals.ts:160` can materialize missing object containers.
- Existing guardrails: `tests/tests.test.ts:762` covers intentional undefined-path behavior; `tests/computed.test.ts:1476` covers an undefined lookup case, but not direct record proxy reads.
- Follow-up reproduction: current source, current `dist`, npm `@legendapp/state@3.0.0-beta.46`, `syncedCrud`, and a fake-client `syncedSupabase` harness all returned `undefined` without creating phantom keys.
- Reproduced synced normalization failure: fake `syncedSupabase` with rows missing `id` or with `id: null` produced `{ "undefined": ... }` / `{ "null": ... }` after a nullish child read activated loading.
- Root cause: `src/sync-plugins/crud.ts` keyed object/map list results with `value[fieldId]` without rejecting nullish IDs.

# Plan

1. Add regression tests for direct and synced record reads with `undefined` and `null` keys.
2. Add regression coverage for synced object-list rows with missing/null IDs.
3. Skip synced object/map list rows with nullish IDs instead of coercing them into `"undefined"` / `"null"` keys.
4. Preserve existing undefined-path set behavior.
5. Validate with `bun test --timeout 50 tests/tests.test.ts`, `bun test --timeout 300 tests/crud.test.ts`, `bun test --timeout 50 tests/computed.test.ts`, and `npm run typecheck`.

# Run Log

- Started: 2026-07-02T12:23:15Z
- Start state: branch `core`, commit `4ecd0b20`
- Initial dirty state: untracked `tasks/` task document only.
- Inspected:
  - `src/ObservableObject.ts`
  - `src/globals.ts`
  - `tests/tests.test.ts`
- Reproduced current source manually with `bun -e`: direct nullish-key `.get()` / `.peek()` and nested `.name.get()` return `undefined` without adding parent keys.
- Follow-up reproduction checks:
  - current source `syncedCrud({ as: 'object' })`: no phantom keys
  - current `dist` `syncedCrud({ as: 'object' })`: no phantom keys
  - npm `@legendapp/state@3.0.0-beta.46` `syncedCrud({ as: 'object' })`: no phantom keys
  - npm `@legendapp/state@3.0.0-beta.46` fake-client `syncedSupabase`: no phantom keys
- Changed:
  - `src/sync-plugins/crud.ts`
  - `tests/tests.test.ts`
  - `tests/crud.test.ts`
- Follow-up diagnosis:
  - Direct read-only probes still did not create parent keys.
  - Fake `syncedSupabase` with rows missing `id` or with `id: null` reproduced `"undefined"` / `"null"` keys.
  - The same fake `syncedSupabase` with a valid `id` did not reproduce.
- Validation:
  - `bun test --timeout 50 tests/tests.test.ts`: passed
  - `bun test --timeout 50 tests/crud.test.ts`: failed because unrelated existing retry tests exceed 50ms; the new synced nullish-key test passed in this run
  - `bun test --timeout 300 tests/crud.test.ts`: passed
  - `bun test --timeout 50 tests/computed.test.ts`: passed
  - `npm run typecheck`: passed

# Result

Fixed synced record normalization for nullish row IDs. `syncedCrud` now skips object/map rows with `fieldId === undefined/null` instead of creating `"undefined"` / `"null"` keys. Added read-regression coverage for nullish record keys.

# Self Review

- Confidence: 85% | Good: fixes a reproduced bad state with narrow tested code. | Caveat: not confirmed as reporter's exact path.
- Scope: synced record normalization plus nullish-read regressions.
- Risk: rows with nullish IDs are dropped in object/map modes; dev warning added.
- Tests: `tests/tests.test.ts`, `tests/crud.test.ts`, `tests/computed.test.ts`, `npm run typecheck` passed.
- Follow-up: ask reporter whether `select` / `fieldId` / `transform.load` omits IDs.

# GitHub Follow-up

I could not reproduce `record$[undefined].get()` / `.peek()` creating parent record data by itself. I tested direct/nested/observed reads, `syncedCrud({ as: 'object' })`, and fake `syncedSupabase` against the reported beta.

I did reproduce a nearby synced-object case: rows with missing/null configured `fieldId` can become `"undefined"` / `"null"` keys. A nullish-key read can activate sync, making the read look causal.

Could your Supabase `select`, `fieldId`, or `transform.load` omit/null out `id`? When the ghost appears, what is `cards$.get().undefined` / `.null`: a real row object or an empty proxy-like object?
