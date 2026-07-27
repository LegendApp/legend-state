---
id: issue-658-indexeddb-symbol-delete
source_type: github_issue
source: https://github.com/LegendApp/legend-state/issues/658
repo: LegendApp/legend-state
issue_number: 658
issue_url: https://github.com/LegendApp/legend-state/issues/658
issue_title: IndexedDB persistence crashes with DataCloneError when persisting a deleted symbolDelete value
triage_status: ready
issue_type: bug
area: persist
severity: critical
urgency: critical
effort: s
confidence: high
repro_quality: strong
priority_score: 99
priority_reason: Every sentinel-based IndexedDB deletion can throw instead of persisting.
next_action: review
approval: approved
implementation_status: done
base_ref: cd6ee1ba85dd8725bf862797606050ff14b76e93
agent_doc_version: 1
updated_at: 2026-07-27
---

# Issue

IndexedDB's structured clone rejects Legend's `symbolDelete` sentinel. `_setItem` treated only falsy values as deletions, so the truthy sentinel reached `IDBObjectStore.put` through both item changes and root-table replacement.

# Triage

- **Status:** ready
- **Decision:** Treat only Legend's exact `symbolDelete` sentinel as deletion at the IndexedDB item-write boundary.
- **Scope:** Item-level and root-replacement deletion paths. Arbitrary symbols remain unsupported data and are not silently deleted.

# Evidence

- `symbolDelete` is truthy.
- `_setItem` called `store.put` for every truthy value.
- `_setTable` delegates every root entry to `_setItem`.
- New focused tests failed before the fix with `DataCloneError` on both paths.

# Problem Area

- Boundary: converting Legend change sentinels into IndexedDB write/delete operations.
- Invariants:
  - `symbolDelete` deletes the key and never reaches structured clone.
  - Normal falsy deletion behavior remains unchanged.
  - Arbitrary symbols are not reinterpreted as deletion.
- Relevant transitions: child delete and root replacement containing a deleted child.

# Plan

1. Add failing direct-plugin regressions for item and root paths.
2. Match `symbolDelete` in `_setItem`'s delete condition.
3. Run the IndexedDB suite, typecheck, lint, format, and diff checks.

# Remaining Risks

- Other persistence plugins may serialize deletion sentinels differently; issue #658 explicitly scoped those out.
- IndexedDB still rejects arbitrary symbol-valued user data, which is correct because it is not structured-cloneable.

# Run Log

- Reproduced both paths: 10 tests passed and the two new tests threw `DataCloneError`.
- Changed `src/persist-plugins/indexeddb.ts` and `tests/persist-indexeddb.test.ts`.
- Validation passed:
  - `bun test tests/persist-indexeddb.test.ts --timeout 300` — 12 passed.
  - `npm run typecheck`.
  - `npm run lint:check`.
  - `npm run format:check`.
  - `git diff --check`.
- One cold run exceeded the file's existing 150 ms test timeout by 3 ms; the isolated rerun passed in 22 ms and the suite completed in 188 ms.

# Result

IndexedDB now maps the exact Legend deletion sentinel to `store.delete` for both item and root-table persistence paths.

# Self Review

- Confidence: 98% | Good: Exact before/after reproduction, shared boundary fix, both paths covered, and static checks pass. | Caveat: No real-browser IndexedDB run was needed because fake-indexeddb throws through the same structured-clone boundary.
